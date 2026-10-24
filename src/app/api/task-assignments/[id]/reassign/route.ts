import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import { decideTaskReassignment } from "../../../../lib/task-assignments-policy";
import type { UserRole } from "../../../../lib/roles";

/**
 * POST /api/task-assignments/[id]/reassign
 * إعادة توجيه مهمة شخصية (person) اعتذر عنها العضو السابق (status='declined') إلى عضو جديد.
 * الجسم: { targetUserId: string }
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
    .select("id, role, department_id, status")
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

  // 2) قراءة جسم الطلب وفحص معرف العضو الجديد
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawTargetUserId = body.targetUserId ?? body.target_user_id;
  if (typeof rawTargetUserId !== "string" || !rawTargetUserId.trim()) {
    return NextResponse.json(
      { error: "معرّف المستخدم المستهدف الجديد (targetUserId) مطلوب." },
      { status: 400 }
    );
  }

  const targetUserId = rawTargetUserId.trim();
  const molIdRegex = /^MOL-\d{5}$/;
  if (!molIdRegex.test(targetUserId)) {
    return NextResponse.json(
      { error: "معرّف المستخدم المستهدف يجب أن يكون بصيغة MOL-XXXXX صالحة." },
      { status: 400 }
    );
  }

  // 3) قراءة سجل التكليف الحالي والمهمة المرتبطة به
  const { data: assignment, error: fetchErr } = await supabase
    .from("task_assignments")
    .select(`
      id,
      task_id,
      user_id,
      status,
      status_reason,
      task:tasks (
        id,
        title,
        target_type,
        lifecycle_status,
        created_by,
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

  const taskObj = Array.isArray(assignment.task)
    ? assignment.task[0]
    : assignment.task;

  if (!taskObj) {
    return NextResponse.json(
      { error: "المهمة المرتبطة بالتكليف غير موجودة." },
      { status: 404 }
    );
  }

  // 4) جلب بيانات العضو المستهدف الجديد
  const { data: targetUser, error: targetErr } = await supabase
    .from("users")
    .select("id, role, department_id, status")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetUser) {
    return NextResponse.json(
      { error: "المستخدم المستهدف الجديد غير موجود في النظام." },
      { status: 404 }
    );
  }

  // 5) التحقق من الصلاحيات والشروط عبر الدالة النقية
  const decision = decideTaskReassignment(
    {
      id: currentUser.id,
      role: currentUser.role as UserRole,
      departmentId: currentUser.department_id as string | null,
      status: currentUser.status,
    },
    {
      id: assignment.id,
      user_id: assignment.user_id,
      status: assignment.status,
    },
    {
      id: String(taskObj.id),
      target_type: taskObj.target_type,
      lifecycle_status: taskObj.lifecycle_status,
      created_by: taskObj.created_by,
    },
    {
      id: targetUser.id,
      role: targetUser.role as UserRole,
      departmentId: targetUser.department_id as string | null,
      status: targetUser.status,
    }
  );

  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason },
      { status: decision.statusCode }
    );
  }

  const prevTargetUserId = assignment.user_id;

  // 6) التحقق من عدم وجود سجل سابق للعضو المستهدف على هذه المهمة (أي حالة) — قبل أي تعديل
  const { data: existingCheck, error: existCheckErr } = await supabase
    .from("task_assignments")
    .select("id")
    .eq("task_id", taskObj.id)
    .eq("user_id", targetUser.id)
    .maybeSingle();

  if (existCheckErr) {
    return NextResponse.json(
      { error: "تعذر التحقق من سجلات التكليف." },
      { status: 500 }
    );
  }

  if (existingCheck) {
    return NextResponse.json(
      { error: "لهذا العضو سجل سابق على المهمة." },
      { status: 409 }
    );
  }

  // 7) تحديث المستخدم المستهدف في جدول tasks (متفائل: يتحقق من lifecycle_status وtarget_user_id الحالي)
  const { data: updatedTask, error: taskUpdateErr } = await supabase
    .from("tasks")
    .update({
      target_user_id: targetUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskObj.id)
    .eq("lifecycle_status", "open")
    .eq("target_user_id", prevTargetUserId)
    .select()
    .maybeSingle();

  if (taskUpdateErr) {
    return NextResponse.json(
      { error: "تعذر تحديث المهمة بالهدف الجديد." },
      { status: 500 }
    );
  }

  if (!updatedTask) {
    return NextResponse.json(
      { error: "تغيّرت المهمة، حدّث الصفحة." },
      { status: 409 }
    );
  }

  // 8 مؤقت) إنشاء سجل التكليف الجديد (offered)
  const { data: insertedAsgn, error: asgnInsertErr } = await supabase
    .from("task_assignments")
    .insert({
      task_id: taskObj.id,
      user_id: targetUser.id,
      status: "offered",
      offered_by: currentUser.id,
    })
    .select()
    .maybeSingle();

  if (asgnInsertErr || !insertedAsgn) {
    // تراجع عن تحديث المهمة
    await supabase
      .from("tasks")
      .update({ target_user_id: prevTargetUserId })
      .eq("id", taskObj.id)
      .eq("target_user_id", targetUser.id);

    return NextResponse.json(
      { error: "تعذر إنشاء سجل التكليف للعضو الجديد." },
      { status: 500 }
    );
  }

  const newAssignmentId = String(insertedAsgn.id);

  // دالة مساعدة للتراجع الآمن عند فشل الخطوات التالية
  const performRollback = async () => {
    let taskRollbackOk = true;
    let asgnRollbackOk = true;

    const { error: rTaskErr } = await supabase
      .from("tasks")
      .update({ target_user_id: prevTargetUserId })
      .eq("id", taskObj.id)
      .eq("target_user_id", targetUser.id);
    if (rTaskErr) taskRollbackOk = false;

    const { error: rDelErr } = await supabase
      .from("task_assignments")
      .delete()
      .eq("id", newAssignmentId);
    if (rDelErr) asgnRollbackOk = false;

    return taskRollbackOk && asgnRollbackOk;
  };

  // 8) تدوين الحدث في task_events
  const { error: eventErr } = await supabase.from("task_events").insert({
    task_id: taskObj.id,
    assignment_id: newAssignmentId,
    actor_id: currentUser.id,
    event_type: "reassign_task",
    reason: `إعادة توجيه المهمة إلى ${targetUser.id} بعد اعتذار ${prevTargetUserId}`,
  });

  if (eventErr) {
    const rollbackSuccess = await performRollback();
    if (!rollbackSuccess) {
      console.error(
        `CRITICAL: Rollback failed for task ${taskObj.id} and assignment ${newAssignmentId} after event failure:`,
        eventErr
      );
      return NextResponse.json(
        { error: "تعذر توثيق العملية وفشل التراجع التلقائي. يرجى التواصل مع الإدارة فوراً." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "تعذر تدوين حدث إعادة التوجيه. أُلغيت العملية للحفاظ على النزاهة." },
      { status: 500 }
    );
  }

  // 9) تدوين الحدث في audit_logs
  const auditPayload = {
    actor_id: currentUser.id,
    category: "tasks",
    action: "create_task",
    target_type: "tasks",
    target_id: String(taskObj.id),
    target_user_id: targetUser.id,
    department_id: taskObj.department_id,
    before_data: {
      declined_user_id: prevTargetUserId,
      declined_assignment_id: assignment.id,
    },
    after_data: {
      new_user_id: targetUser.id,
      new_assignment_id: newAssignmentId,
      status: "offered",
    },
    details: `[إعادة توجيه] إعادة توجيه المهمة ${String(taskObj.id)} إلى ${targetUser.id} بعد اعتذار ${prevTargetUserId}`,
  };

  const { error: auditErr } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditErr) {
    const rollbackSuccess = await performRollback();
    if (!rollbackSuccess) {
      console.error(
        `CRITICAL: Rollback failed for task ${taskObj.id} and assignment ${newAssignmentId} after audit failure:`,
        auditErr
      );
      return NextResponse.json(
        { error: "تعذر توثيق العملية وفشل التراجع التلقائي. يرجى التواصل مع الإدارة فوراً." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "تعذر توثيق العملية في سجل التدقيق. أُلغيت العملية للحفاظ على النزاهة." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    assignment: insertedAsgn,
    task_id: taskObj.id,
  });
}
