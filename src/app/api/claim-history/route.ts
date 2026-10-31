import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest } from "../../lib/server-auth";

const MAX_HOURS_PER_LOG = 24;

/**
 * POST /api/claim-history
 * يقبل access_code من المتطوع، يبحث عن سجله في volunteer_notion_history،
 * وإذا وُجد وغير مُستعاد سابقاً:
 *   1. يُنشئ task + task_assignment معتمدة لكل مهمة
 *   2. يُنشئ hours_logs مرتبطة
 *   3. يُعلّم السجل كـ "مُستعاد"
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  // قراءة access_code من الجسم
  let body: { access_code?: string } = {};
  try { body = await request.json(); } catch { body = {}; }

  const rawCode = (body.access_code ?? "").trim();
  if (!rawCode) {
    return NextResponse.json({ error: "فضلاً أدخل رمز الاستعادة." }, { status: 400 });
  }

  // البحث في جدول السجل التاريخي
  const { data: history, error: histErr } = await supabase
    .from("volunteer_notion_history")
    .select("*")
    .eq("access_code", rawCode)
    .maybeSingle();

  if (histErr) {
    return NextResponse.json({ error: "تعذّر البحث عن السجل." }, { status: 500 });
  }

  if (!history) {
    return NextResponse.json(
      { error: "رمز الاستعادة غير صحيح أو غير موجود في السجلات." },
      { status: 404 }
    );
  }

  // التحقق من عدم الاستعادة المسبقة
  if (history.claimed_by) {
    if (history.claimed_by === auth.user.id) {
      return NextResponse.json(
        { error: "لقد قمت باستعادة هذا السجل مسبقاً، مهامك وساعاتك محفوظة في حسابك." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "تم استعادة هذا الرمز بواسطة حساب آخر." },
      { status: 409 }
    );
  }

  // جلب قسم المستخدم الحالي
  const { data: currentUser } = await supabase
    .from("users")
    .select("id, department_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  const userDeptId = currentUser?.department_id ?? null;
  const adminId = auth.user.id;
  const now = new Date().toISOString();

  const tasks: Array<{
    title: string;
    hours: number;
    date: string;
    department: string;
    description: string;
  }> = Array.isArray(history.tasks) ? history.tasks : [];

  const importedTasks: Array<{ taskId: string; title: string; hours: number }> = [];
  let totalHoursImported = 0;

  // استيراد كل مهمة
  for (const taskEntry of tasks) {
    const { title, hours, date, description } = taskEntry;
    if (!title || !hours || hours <= 0) continue;

    // 1. إنشاء سجل المهمة
    const { data: newTask, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        title,
        description: description || null,
        target_type: "person",
        target_user_id: auth.user.id,
        target_department_ids: userDeptId ? [userDeptId] : [],
        department_id: userDeptId,
        status: "completed",
        lifecycle_status: "completed",
        priority: "normal",
        required_assignees: 1,
        requested_hours: Math.min(hours, MAX_HOURS_PER_LOG),
        due_date: date,
        created_by: adminId,
        assigned_to: auth.user.id,
        closed_at: now,
      })
      .select("id")
      .single();

    if (taskErr || !newTask) continue;

    const taskId = newTask.id;

    // 2. إنشاء سجلات الساعات (دفعات بحد 24)
    let remaining = hours;
    let batch = 1;
    const batches = Math.ceil(hours / MAX_HOURS_PER_LOG);
    let firstLogId: string | null = null;

    while (remaining > 0) {
      const batchHours = Math.min(remaining, MAX_HOURS_PER_LOG);
      const suffix = batches > 1 ? ` (${batch}/${batches})` : "";
      const { data: log, error: logErr } = await supabase
        .from("hours_logs")
        .insert({
          user_id: auth.user.id,
          department_id: userDeptId,
          task_id: taskId,
          submitted_hours: batchHours,
          approved_hours: batchHours,
          date,
          description: `[إنجاز مهمة: ${title}]${suffix}`,
          status: "approved",
          is_self_approved: false,
          reviewed_by: adminId,
          reviewed_at: now,
          review_notes: "مُستعاد من السجل التاريخي",
        })
        .select("id")
        .single();

      if (logErr) { remaining = 0; break; }
      if (!firstLogId) firstLogId = log.id;
      remaining -= batchHours;
      batch++;
    }

    // 3. إنشاء تكليف submitted ثم تحديثه إلى approved
    const { data: assignment, error: taErr } = await supabase
      .from("task_assignments")
      .insert({
        task_id: taskId,
        user_id: auth.user.id,
        status: "submitted",
        offered_by: adminId,
        accepted_at: now,
        submitted_at: now,
      })
      .select("id")
      .single();

    if (!taErr && assignment && firstLogId) {
      await supabase
        .from("task_assignments")
        .update({
          status: "approved",
          reviewed_by: adminId,
          reviewed_at: now,
          approved_hours: Math.min(hours, MAX_HOURS_PER_LOG),
          hours_log_id: firstLogId,
          review_notes: "مُعتمد تلقائياً - استعادة من السجل التاريخي",
        })
        .eq("id", assignment.id);
    }

    importedTasks.push({ taskId, title, hours });
    totalHoursImported += hours;
  }

  // 4. تعليم السجل كـ مُستعاد
  await supabase
    .from("volunteer_notion_history")
    .update({ claimed_by: auth.user.id, claimed_at: now })
    .eq("access_code", rawCode);

  return NextResponse.json({
    ok: true,
    summary: {
      volunteerName: history.name,
      totalHours: totalHoursImported,
      tasksCount: importedTasks.length,
    },
    tasks: importedTasks,
  });
}

/**
 * GET /api/claim-history?code=ACCESS_CODE
 * معاينة بيانات الاستعادة قبل التأكيد (بدون تنفيذ فعلي).
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "الخدمة غير متاحة مؤقتاً." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "الرمز مطلوب." }, { status: 400 });
  }

  const { data: history, error } = await supabase
    .from("volunteer_notion_history")
    .select("access_code, name, total_hours, tasks, claimed_by, claimed_at")
    .eq("access_code", code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "تعذّر البحث." }, { status: 500 });
  if (!history) return NextResponse.json({ error: "رمز الاستعادة غير صحيح." }, { status: 404 });

  const alreadyClaimed = !!history.claimed_by;
  const claimedByMe = history.claimed_by === auth.user.id;

  const tasks = Array.isArray(history.tasks) ? history.tasks : [];

  return NextResponse.json({
    name: history.name,
    totalHours: history.total_hours,
    tasksCount: tasks.length,
    tasks: tasks.slice(0, 10), // أول 10 مهام فقط للمعاينة
    alreadyClaimed,
    claimedByMe,
  });
}
