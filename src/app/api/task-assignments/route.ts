import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest } from "../../lib/server-auth";
import {
  canViewTaskAssignments,
  type ViewerInfo,
  type TargetUserInfo,
} from "../../lib/task-assignments-policy";
import type { UserRole } from "../../lib/roles";

/**
 * GET /api/task-assignments
 * يرجع للمستخدم الحالي:
 * 1. تكليفاته الخاصة (task_assignments الخاصة به).
 * 2. المهام المتاحة للاستلام في قسمه (lifecycle_status='open', ليس له سجل, عدد الفعّال < required_assignees).
 * 3. المهام التي أنشأها.
 *
 * مع معامل اختياري userId للمسؤولين:
 * - يرجع تكليفات ذلك الشخص إذا سمحت canViewTaskAssignments.
 * - وإلا 403.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  // قراءة بيانات المستخدم الحالي
  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id, role, department_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError || !currentUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  const viewerRole = currentUser.role as UserRole;
  const viewerDeptId = currentUser.department_id as string | null;

  // فحص معامل userId الاختياري
  const { searchParams } = new URL(request.url);
  const targetUserIdParam = searchParams.get("userId");

  // إذا طُلب userId، تحقق من الصلاحية أولاً
  if (targetUserIdParam && targetUserIdParam !== currentUser.id) {
    // نحتاج departmentId الخاص بالمستخدم المستهدف
    const { data: targetUserData, error: targetUserError } = await supabase
      .from("users")
      .select("id, department_id")
      .eq("id", targetUserIdParam)
      .maybeSingle();

    if (targetUserError || !targetUserData) {
      return NextResponse.json(
        { error: "المستخدم المستهدف غير موجود." },
        { status: 404 }
      );
    }

    const viewer: ViewerInfo = {
      id: currentUser.id,
      role: viewerRole,
      departmentId: viewerDeptId,
    };
    const targetUser: TargetUserInfo = {
      id: targetUserData.id,
      departmentId: targetUserData.department_id as string | null,
    };

    if (!canViewTaskAssignments(viewer, targetUser)) {
      return NextResponse.json(
        { error: "لا تملك الصلاحية لعرض تكليفات هذا المستخدم." },
        { status: 403 }
      );
    }

    // إرجاع تكليفات المستخدم المستهدف فقط
    const { data: assignments, error: assignmentsError } = await supabase
      .from("task_assignments")
      .select(
        `
        id,
        task_id,
        user_id,
        status,
        offered_by,
        claimed_at,
        completed_at,
        created_at,
        updated_at,
        task:tasks (
          id,
          title,
          description,
          lifecycle_status,
          priority,
          due_date,
          created_by,
          required_assignees
        )
      `
      )
      .eq("user_id", targetUserIdParam)
      .order("created_at", { ascending: false });

    if (assignmentsError) {
      return NextResponse.json(
        { error: "تعذر جلب التكليفات." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, assignments: assignments ?? [] });
  }

  // المستخدم الحالي: يرجع بياناته الثلاثة
  const userId = targetUserIdParam ?? currentUser.id;

  // 1) تكليفاته الخاصة
  const { data: myAssignments, error: myAssignmentsError } = await supabase
    .from("task_assignments")
    .select(
      `
      id,
      task_id,
      user_id,
      status,
      offered_by,
      claimed_at,
      completed_at,
      created_at,
      updated_at,
      task:tasks (
        id,
        title,
        description,
        lifecycle_status,
        priority,
        due_date,
        created_by,
        required_assignees
      )
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (myAssignmentsError) {
    return NextResponse.json(
      { error: "تعذر جلب تكليفاتك." },
      { status: 500 }
    );
  }

  // 2) المهام المتاحة للاستلام في قسمه
  // lifecycle_status='open', ليس له سجل في task_assignments, عدد الفعّال < required_assignees
  let availableTasks: unknown[] = [];
  if (viewerDeptId) {
    // جلب المهام المفتوحة الخاصة بالقسم
    const { data: openTasks, error: openTasksError } = await supabase
      .from("tasks")
      .select(
        `
        id,
        title,
        description,
        lifecycle_status,
        priority,
        due_date,
        created_by,
        required_assignees,
        department_id,
        target_department_ids,
        target_type
      `
      )
      .eq("lifecycle_status", "open")
      .or(
        `department_id.eq.${viewerDeptId},target_department_ids.cs.{${viewerDeptId}},target_type.eq.all_departments`
      );

    if (!openTasksError && openTasks) {
      // فلترة: ليس للمستخدم سجل فعّال فيها، وعدد الفعّال < required_assignees
      for (const task of openTasks) {
        const taskId = String(task.id);

        // هل للمستخدم سجل في هذه المهمة؟
        const { data: existingAssignment } = await supabase
          .from("task_assignments")
          .select("id, status")
          .eq("task_id", taskId)
          .eq("user_id", userId)
          .maybeSingle();

        if (existingAssignment) continue;

        // عدد التكليفات الفعّالة
        const { count: activeCount } = await supabase
          .from("task_assignments")
          .select("id", { count: "exact", head: true })
          .eq("task_id", taskId)
          .in("status", ["active", "in_progress"]);

        const activeNum = activeCount ?? 0;
        const requiredNum = task.required_assignees;

        // إذا كان required_assignees=null فلا حد، وإلا تحقق من العدد
        if (requiredNum !== null && activeNum >= requiredNum) continue;

        availableTasks.push(task);
      }
    }
  }

  // 3) المهام التي أنشأها المستخدم
  const { data: createdTasks, error: createdTasksError } = await supabase
    .from("tasks")
    .select(
      `
      id,
      title,
      description,
      lifecycle_status,
      priority,
      due_date,
      created_by,
      required_assignees,
      target_type,
      created_at,
      updated_at
    `
    )
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (createdTasksError) {
    return NextResponse.json(
      { error: "تعذر جلب المهام التي أنشأتها." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    assignments: myAssignments ?? [],
    availableTasks,
    createdTasks: createdTasks ?? [],
  });
}
