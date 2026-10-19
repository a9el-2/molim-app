import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import type { UserRole } from "../../../../lib/roles";

/**
 * POST /api/tasks/[id]/review
 * اعتماد أو رفض إنجاز وساعات المهمة.
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

  // 1. بيانات المراجع
  const { data: reviewerUser, error: reviewerError } = await supabase
    .from("users")
    .select("id, role, department_id, first_name, last_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (reviewerError || !reviewerUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  const reviewerRole = reviewerUser.role as UserRole;
  const reviewerDeptId = reviewerUser.department_id as string | null;

  if (reviewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية مراجعة المهام." },
      { status: 403 }
    );
  }

  // 2. بيانات المهمة
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

  if (task.status !== "in_review") {
    return NextResponse.json(
      { error: "المهمة ليست بانتظار المراجعة حالياً." },
      { status: 400 }
    );
  }

  // التحقق من صلاحية رئيس القسم
  if (reviewerRole === "DEPARTMENT_HEAD" && task.department_id !== reviewerDeptId) {
    return NextResponse.json(
      { error: "لا يمكنك مراجعة مهام خارج قسمك." },
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

  const action = body.action === "reject" ? "reject" : body.action === "approve" ? "approve" : null;
  if (!action) {
    return NextResponse.json(
      { error: "يرجى تحديد نوع الإجراء (اعتماد approve أو رفض reject)." },
      { status: 400 }
    );
  }

  const note = String(body.note ?? body.reason ?? "").trim();
  const now = new Date().toISOString();

  // جلب سجل الساعات المرتبط بالمهمة
  const { data: hoursLog } = await supabase
    .from("hours_logs")
    .select("*")
    .eq("task_id", taskId)
    .maybeSingle();

  const submittedHours = hoursLog ? Number(hoursLog.submitted_hours) : Number(task.requested_hours ?? 1);

  if (action === "approve") {
    const rawHours = body.approvedHours ?? body.hours ?? submittedHours;
    const approvedHours = typeof rawHours === "number" ? rawHours : Number(rawHours);

    if (
      Number.isNaN(approvedHours) ||
      approvedHours < 0.25 ||
      approvedHours > 24 ||
      Math.abs(approvedHours * 4 - Math.round(approvedHours * 4)) > 1e-6
    ) {
      return NextResponse.json(
        { error: "الساعات المعتمدة يجب أن تكون بين 0.25 و 24 ومضاعف للرقم 0.25." },
        { status: 400 }
      );
    }

    if (approvedHours !== submittedHours && !note) {
      return NextResponse.json(
        { error: "عند تعديل عدد الساعات عن الساعات المقدمة، يجب كتابة ملاحظة توضيحية لسبب التعديل." },
        { status: 400 }
      );
    }

    // تحديث المهمة إلى completed
    await supabase
      .from("tasks")
      .update({
        status: "completed",
        reviewed_by: reviewerUser.id,
        reviewed_at: now,
        review_decision: "approved",
        review_reason: note || null,
        updated_at: now,
      })
      .eq("id", taskId);

    // تحديث أو إنشاء ساعات معتمدة في hours_logs
    if (hoursLog) {
      await supabase
        .from("hours_logs")
        .update({
          status: "approved",
          approved_hours: approvedHours,
          reviewed_by: reviewerUser.id,
          reviewed_at: now,
          review_notes: note || null,
          updated_at: now,
        })
        .eq("id", hoursLog.id);
    } else {
      await supabase.from("hours_logs").insert({
        user_id: task.assigned_to || task.created_by,
        task_id: taskId,
        department_id: task.department_id || reviewerDeptId,
        submitted_hours: approvedHours,
        approved_hours: approvedHours,
        date: now.split("T")[0],
        description: `[إنجاز مهمة: ${task.title}] معتمدة`,
        status: "approved",
        reviewed_by: reviewerUser.id,
        reviewed_at: now,
        review_notes: note || null,
        is_self_approved: false,
      });
    }

    // تسجيل في audit_logs
    await supabase.from("audit_logs").insert({
      actor_id: reviewerUser.id,
      category: "tasks",
      action: "approve_task",
      target_type: "tasks",
      target_id: String(taskId),
      target_user_id: task.assigned_to || task.created_by,
      department_id: task.department_id,
      before_data: { status: "in_review" },
      after_data: { status: "completed", approved_hours: approvedHours },
      details: `تم اعتماد إنجاز المهمة «${task.title}» واحتساب ${approvedHours} ساعة تطوعية.`,
    });

    return NextResponse.json({
      ok: true,
      message: `تم اعتماد المهمة بنجاح واحتساب ${approvedHours} ساعة للمتطوع.`,
    });
  } else {
    // رفض الإنجاز
    if (!note) {
      return NextResponse.json(
        { error: "يرجى كتابة سبب الرفض أو التعديل المطلوب ليعود للمتطوع." },
        { status: 400 }
      );
    }

    // إعادة المهمة إلى in_progress مع تسجيل سبب الرفض
    await supabase
      .from("tasks")
      .update({
        status: "in_progress",
        reviewed_by: reviewerUser.id,
        reviewed_at: now,
        review_decision: "rejected",
        review_reason: note,
        updated_at: now,
      })
      .eq("id", taskId);

    if (hoursLog) {
      await supabase
        .from("hours_logs")
        .update({
          status: "rejected",
          review_notes: note,
          reviewed_by: reviewerUser.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", hoursLog.id);
    }

    // تسجيل في audit_logs
    await supabase.from("audit_logs").insert({
      actor_id: reviewerUser.id,
      category: "tasks",
      action: "reject_task",
      target_type: "tasks",
      target_id: String(taskId),
      target_user_id: task.assigned_to || task.created_by,
      department_id: task.department_id,
      before_data: { status: "in_review" },
      after_data: { status: "in_progress", review_reason: note },
      details: `تم رفض إنجاز المهمة «${task.title}». السبب: ${note}`,
    });

    return NextResponse.json({
      ok: true,
      message: "تم رفض الإنجاز وإعادة المهمة للمتطوع مع الملاحظات.",
    });
  }
}
