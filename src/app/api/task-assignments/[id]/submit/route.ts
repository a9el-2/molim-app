import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import { decideAssignmentAction } from "../../../../lib/task-assignments-policy";

/**
 * POST /api/task-assignments/[id]/submit
 * تسليم العضو للمهمة المكتملة وطلب المراجعة (من in_progress أو needs_revision إلى submitted).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  // 1) قراءة بيانات المستخدم الحالي
  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id, status")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError || !currentUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  if (String(currentUser.status ?? "").toLowerCase() !== "active") {
    return NextResponse.json(
      { error: "حسابك غير نشط." },
      { status: 403 }
    );
  }

  // 2) قراءة سجل التكليف المطلوب
  const { data: assignment, error: fetchErr } = await supabase
    .from("task_assignments")
    .select(`
      id,
      task_id,
      user_id,
      status,
      submitted_at,
      status_reason,
      created_at,
      updated_at,
      task:tasks (
        id,
        department_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !assignment) {
    return NextResponse.json(
      { error: "سجل التكليف غير موجود." },
      { status: 404 }
    );
  }

  // 3) التحقق من الصلاحية عبر دالة السياسة
  const actionDecision = decideAssignmentAction(
    { id: currentUser.id, status: currentUser.status },
    { id: assignment.id, user_id: assignment.user_id, status: assignment.status },
    "submit"
  );

  if (!actionDecision.allowed) {
    return NextResponse.json(
      { error: actionDecision.message, reason: actionDecision.reason },
      { status: actionDecision.statusCode }
    );
  }

  // 4) التحديث المتفائل للحالة إلى submitted مع submitted_at = now
  const nowIso = new Date().toISOString();
  const { data: updatedRecord, error: updateErr } = await supabase
    .from("task_assignments")
    .update({
      status: "submitted",
      submitted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", id)
    .eq("status", assignment.status)
    .select()
    .maybeSingle();

  if (updateErr || !updatedRecord) {
    if (updateErr) {
      return NextResponse.json(
        { error: "تعذر تسليم التكليف." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "تغيرت حالة التكليف أثناء المعالجة. حدّث الصفحة وحاول مجدداً." },
      { status: 409 }
    );
  }

  const taskObj = Array.isArray(assignment.task)
    ? assignment.task[0]
    : assignment.task;
  const deptId = taskObj?.department_id ?? null;

  // 5) تدوين الحدث في task_events
  await supabase.from("task_events").insert({
    task_id: assignment.task_id,
    assignment_id: id,
    actor_id: currentUser.id,
    event_type: "submit_task",
    reason: "تسليم المهمة وطلب المراجعة والاعتماد",
  });

  // 6) تدوين الحدث في audit_logs
  const { task: _t, ...cleanBeforeData } = assignment;
  const auditPayload = {
    actor_id: currentUser.id,
    category: "tasks",
    action: "submit_task",
    target_type: "tasks",
    target_id: String(assignment.task_id),
    target_user_id: assignment.user_id,
    department_id: deptId,
    before_data: cleanBeforeData,
    after_data: updatedRecord,
    details: "تسليم المهمة للمراجعة",
  };

  const { error: auditErr } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditErr) {
    // التراجع في حال فشل التدقيق
    await supabase
      .from("task_assignments")
      .update({
        status: assignment.status,
        submitted_at: assignment.submitted_at,
        updated_at: assignment.updated_at,
      })
      .eq("id", id)
      .eq("status", updatedRecord.status);

    return NextResponse.json(
      { error: "تعذر توثيق العملية في سجل التدقيق. أُلغيت العملية للحفاظ على النزاهة." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, assignment: updatedRecord });
}
