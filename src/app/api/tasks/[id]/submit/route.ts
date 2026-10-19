import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import { isValidISODate } from "../../../../lib/hours-policy";
import type { UserRole } from "../../../../lib/roles";

/**
 * POST /api/tasks/[id]/submit
 * تسليم إنجاز المهمة من قبل العضو وطلب مراجعتها واعتماد الساعات.
 * 
 * المدخلات:
 * - hours: عدد الساعات المستغرقة (موجب، مضاعف 0.25، حتى 24 ساعة للدفعة)
 * - notes: وصف ما تم إنجازه (إجباري)
 * - links: روابط المخرجات والمرفقات (اختياري)
 * 
 * الإجراء:
 * 1. التحقق من وجود المهمة وأحقية المستخدم في تسليمها (أن تكون قيد التنفيذ).
 * 2. تحديث حالة المهمة إلى "in_review" وحفظ وصف الإنجاز.
 * 3. إنشاء أو تحديث سجل في hours_logs مرتبط برقم المهمة بحالة "in_review".
 * 4. تسجيل العملية في audit_logs.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id: taskId } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  // 1. قراءة بيانات المستخدم الحالي
  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id, role, department_id, first_name, last_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError || !currentUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  // 2. قراءة بيانات المهمة
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError || !task) {
    return NextResponse.json(
      { error: "المهمة غير موجودة." },
      { status: 404 }
    );
  }

  // التحقق من حالة المهمة: يجب ألا تكون مكتملة بالفعل
  if (task.status === "completed") {
    return NextResponse.json(
      { error: "هذه المهمة مكتملة ومعتمدة مسبقاً." },
      { status: 400 }
    );
  }

  // التحقق من أحقية تسليم المهمة: المهام الشخصية أو الموجهة لشخص محدد لا يمكن تسليمها إلا من قبله
  if (
    task.target_type === "self" &&
    task.created_by !== currentUser.id &&
    task.target_user_id !== currentUser.id
  ) {
    return NextResponse.json(
      { error: "هذه المهمة شخصية وخاصة بعضو آخر ولا يمكنك تسليمها." },
      { status: 403 }
    );
  }

  if (task.target_user_id && task.target_user_id !== currentUser.id) {
    return NextResponse.json(
      { error: "هذه المهمة مخصصة لعضو آخر ولا يمكنك تسليمها." },
      { status: 403 }
    );
  }

  // 3. قراءة جسم الطلب
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawHours = body.hours ?? body.submittedHours;
  const rawNotes = String(body.notes ?? body.description ?? "").trim();
  const rawLinks = String(body.links ?? body.attachmentUrl ?? "").trim();

  if (!rawNotes) {
    return NextResponse.json(
      { error: "يرجى كتابة وصف موجز لما قمت بإنجازه في هذه المهمة." },
      { status: 400 }
    );
  }

  const hours = typeof rawHours === "number" ? rawHours : Number(rawHours);
  if (
    Number.isNaN(hours) ||
    !Number.isFinite(hours) ||
    hours < 0.25 ||
    hours > 24 ||
    Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-6
  ) {
    return NextResponse.json(
      { error: "عدد الساعات يجب أن يكون بين 0.25 و 24 ساعة ومن مضاعفات الربع ساعة (0.25)." },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const submissionDescription = rawLinks
    ? `${rawNotes}\n\n🔗 روابط المرفقات: ${rawLinks}`
    : rawNotes;

  // 4. تحديث المهمة إلى in_review
  const beforeTaskData = { ...task };
  const { error: updateTaskError } = await supabase
    .from("tasks")
    .update({
      status: "in_review",
      requested_hours: hours,
      assigned_to: currentUser.id,
      review_decision: null,
      review_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (updateTaskError) {
    return NextResponse.json(
      { error: "تعذر تحديث حالة المهمة." },
      { status: 500 }
    );
  }

  // 5. إنشاء أو تحديث سجل ساعات في hours_logs مرتبط برقم المهمة
  const effectiveDeptId = task.department_id || currentUser.department_id;

  // فحص ما إذا كان هناك سجل سابق للمهمة
  const { data: existingHoursLog } = await supabase
    .from("hours_logs")
    .select("id")
    .eq("task_id", taskId)
    .maybeSingle();

  let hoursLogId: string | number;

  if (existingHoursLog) {
    hoursLogId = existingHoursLog.id;
    await supabase
      .from("hours_logs")
      .update({
        user_id: currentUser.id,
        department_id: effectiveDeptId,
        submitted_hours: hours,
        approved_hours: null,
        date: today,
        description: `[إنجاز مهمة: ${task.title}] ${submissionDescription}`,
        status: "in_review",
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingHoursLog.id);
  } else {
    const { data: insertedHours, error: insertError } = await supabase
      .from("hours_logs")
      .insert({
        user_id: currentUser.id,
        task_id: taskId,
        department_id: effectiveDeptId,
        submitted_hours: hours,
        approved_hours: null,
        date: today,
        description: `[إنجاز مهمة: ${task.title}] ${submissionDescription}`,
        status: "in_review",
        is_self_approved: false,
      })
      .select("id")
      .single();

    if (insertError || !insertedHours) {
      // rollback task status
      await supabase
        .from("tasks")
        .update({ status: beforeTaskData.status })
        .eq("id", taskId);

      return NextResponse.json(
        { error: "تعذر تسجيل ساعات المهمة للمراجعة." },
        { status: 500 }
      );
    }
    hoursLogId = insertedHours.id;
  }

  // 6. تسجيل العملية في audit_logs
  await supabase.from("audit_logs").insert({
    actor_id: currentUser.id,
    category: "tasks",
    action: "submit_task_for_review",
    target_type: "tasks",
    target_id: String(taskId),
    target_user_id: currentUser.id,
    department_id: effectiveDeptId,
    before_data: { status: beforeTaskData.status },
    after_data: {
      status: "in_review",
      submitted_hours: hours,
      hours_log_id: hoursLogId,
    },
    details: `تم تسليم إنجاز المهمة «${task.title}» وطلب اعتماد ${hours} ساعة.`,
  });

  return NextResponse.json({
    ok: true,
    message: "تم تسليم المهمة بنجاح وتحويلها لمراجعة المسؤولين.",
  });
}
