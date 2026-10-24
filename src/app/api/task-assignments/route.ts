import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest } from "../../lib/server-auth";
import {
  canViewTaskAssignments,
  isTaskAvailableForUser,
  SEAT_STATUSES,
  type ViewerInfo,
  type TargetUserInfo,
  type UserAvailableCandidate,
} from "../../lib/task-assignments-policy";
import type { UserRole } from "../../lib/roles";

/**
 * GET /api/task-assignments
 * يرجع للمستخدم الحالي:
 * 1. تكليفاته الخاصة (task_assignments الخاصة به).
 * 2. المهام المتاحة للاستلام (lifecycle_status='open', ليس له سجل فيها، وعدد المقاعد المشغولة < required_assignees).
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

  // قراءة بيانات المستخدم الحالي والتأكد من حالته
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

  const viewerRole = currentUser.role as UserRole;
  const viewerDeptId = currentUser.department_id as string | null;
  const viewerStatus = String(currentUser.status ?? "pending");

  // فحص معامل userId الاختياري
  const { searchParams } = new URL(request.url);
  const targetUserIdParam = searchParams.get("userId");

  // إذا طُلب userId لمستخدم آخر، تحقق من الصلاحية أولاً
  if (targetUserIdParam && targetUserIdParam !== currentUser.id) {
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

    // إرجاع تكليفات المستخدم المستهدف بالأعمدة الرسمية من db/planned/0003b_tasks_assignments.sql
    const { data: assignments, error: assignmentsError } = await supabase
      .from("task_assignments")
      .select(
        `
        id,
        task_id,
        user_id,
        status,
        offered_by,
        accepted_at,
        submitted_at,
        reviewed_at,
        status_reason,
        approved_hours,
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

  // للمستخدم الحالي
  const userId = targetUserIdParam ?? currentUser.id;

  // 1) تكليفاته الخاصة بالأعمدة الرسمية من db/planned/0003b_tasks_assignments.sql
  const { data: myAssignments, error: myAssignmentsError } = await supabase
    .from("task_assignments")
    .select(
      `
      id,
      task_id,
      user_id,
      status,
      offered_by,
      accepted_at,
      submitted_at,
      reviewed_at,
      status_reason,
      approved_hours,
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

  // 2) المهام المتاحة للاستلام
  // تجلب المهام المفتوحة ثم تُصفّى بدالة نقية بدون .or() يدوي، مع منع N+1 باستعلام واحد
  const availableTasks: unknown[] = [];

  if (viewerStatus === "active") {
    // أ) جلب كل المهام المفتوحة
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
        target_user_id,
        required_assignees,
        department_id,
        target_department_ids,
        target_type,
        created_at,
        updated_at
      `
      )
      .eq("lifecycle_status", "open");

    if (!openTasksError && openTasks && openTasks.length > 0) {
      const userCandidate: UserAvailableCandidate = {
        id: currentUser.id,
        role: viewerRole,
        departmentId: viewerDeptId,
        status: viewerStatus,
      };

      // ب) التصفية بدالة نقية آمنة تغطي كافة الأنواع
      const candidateTasks = openTasks.filter((task) =>
        isTaskAvailableForUser(task, userCandidate)
      );

      if (candidateTasks.length > 0) {
        const candidateTaskIds = candidateTasks.map((t) => String(t.id));

        // ج) استعلام واحد لتكليفات جميع المهام المرشحة (منع استعلام N+1)
        const { data: candidateAssignments, error: candError } = await supabase
          .from("task_assignments")
          .select("id, task_id, user_id, status")
          .in("task_id", candidateTaskIds);

        if (!candError) {
          const allAssignments = candidateAssignments ?? [];

          // د) التحقق في الذاكرة: عدم وجود تكليف للعضو + عدم اكتمال المقاعد المشغولة
          for (const task of candidateTasks) {
            const taskId = String(task.id);

            // هل للعضو سجل تكليف سابق في هذه المهمة؟
            const hasExisting = allAssignments.some(
              (a) => a.task_id === taskId && a.user_id === userId
            );
            if (hasExisting) continue;

            // عدّ المقاعد المشغولة بالحالات المحددة رسمياً SEAT_STATUSES
            const occupiedSeats = allAssignments.filter(
              (a) =>
                a.task_id === taskId &&
                (SEAT_STATUSES as readonly string[]).includes(a.status)
            ).length;

            const reqAssignees = task.required_assignees;
            if (
              reqAssignees !== null &&
              reqAssignees !== undefined &&
              occupiedSeats >= Number(reqAssignees)
            ) {
              continue;
            }

            availableTasks.push(task);
          }
        }
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
