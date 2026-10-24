import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import { decideReviewPermission } from "../../../lib/task-assignments-policy";
import type { UserRole } from "../../../lib/roles";

/**
 * GET /api/task-assignments/review
 * جلب جميع التكليفات المسلّمة (status='submitted') التي يحق للمستخدم الحالي مراجعتها.
 * - المتطوع لا يملك صلاحية المراجعة (403).
 * - رئيس القسم يرى تكليفات قسمه فقط.
 * - HR و ADMIN يريان الجميع عدا أنفسهما.
 * - SUPER_ADMIN يرى الجميع (وإن كان الوحيد النشط يرى تكليفاته الذاتية أيضاً).
 * - استعلام واحد مجمّع لتجنب مشكلة N+1 مع ضم بيانات المهمة والعضو.
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

  const reviewerRole = currentUser.role as UserRole;
  if (reviewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية مراجعة المهام." },
      { status: 403 }
    );
  }

  // 2) التحقق من وجود سوبر أدمن آخر نشط
  let soleActiveSuperAdmin = false;
  if (reviewerRole === "SUPER_ADMIN") {
    const { data: otherSuperAdmins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "SUPER_ADMIN")
      .eq("status", "active")
      .neq("id", currentUser.id);

    soleActiveSuperAdmin = (otherSuperAdmins?.length ?? 0) === 0;
  }

  // 3) جلب كافة التكليفات المسلّمة باستعلام واحد لتجنب N+1
  const { data: assignments, error: fetchErr } = await supabase
    .from("task_assignments")
    .select(`
      id,
      task_id,
      user_id,
      status,
      offered_by,
      accepted_at,
      submitted_at,
      status_reason,
      created_at,
      updated_at,
      user:users!task_assignments_user_id_fkey (
        id,
        first_name,
        father_name,
        last_name,
        role,
        department_id
      ),
      task:tasks (
        id,
        title,
        description,
        department_id,
        priority,
        due_date
      )
    `)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  if (fetchErr) {
    return NextResponse.json(
      { error: "تعذر جلب التكليفات للمراجعة." },
      { status: 500 }
    );
  }

  // 4) تصفية النتائج في الذاكرة بالاعتماد على دالة السياسة decideReviewPermission
  const reviewer = {
    id: currentUser.id,
    role: reviewerRole,
    departmentId: currentUser.department_id as string | null,
  };

  const reviewable = (assignments ?? []).filter((assignment) => {
    if (!assignment.user) return false;
    const ownerObj = Array.isArray(assignment.user)
      ? assignment.user[0]
      : assignment.user;

    if (!ownerObj) return false;

    const owner = {
      id: ownerObj.id,
      role: ownerObj.role as UserRole,
      departmentId: (ownerObj.department_id as string | null) ?? null,
    };

    const decision = decideReviewPermission(
      reviewer,
      owner,
      soleActiveSuperAdmin
    );

    return decision.allowed;
  });

  // 5) تشكيل الخرج مع أسماء المتطوعين وبيانات المهام
  const formatted = reviewable.map((assignment) => {
    const ownerObj = Array.isArray(assignment.user)
      ? assignment.user[0]
      : assignment.user;
    const taskObj = Array.isArray(assignment.task)
      ? assignment.task[0]
      : assignment.task;

    const volunteerName = ownerObj
      ? [ownerObj.first_name, ownerObj.father_name, ownerObj.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || "غير معروف"
      : "غير معروف";

    return {
      id: assignment.id,
      task_id: assignment.task_id,
      user_id: assignment.user_id,
      status: assignment.status,
      offered_by: assignment.offered_by,
      accepted_at: assignment.accepted_at,
      submitted_at: assignment.submitted_at,
      status_reason: assignment.status_reason,
      created_at: assignment.created_at,
      updated_at: assignment.updated_at,
      volunteer_name: volunteerName,
      volunteer_role: ownerObj?.role ?? null,
      volunteer_department_id: ownerObj?.department_id ?? null,
      task_title: taskObj?.title ?? "بدون عنوان",
      task_description: taskObj?.description ?? null,
      task_department_id: taskObj?.department_id ?? null,
      task_priority: taskObj?.priority ?? "normal",
      task_due_date: taskObj?.due_date ?? null,
    };
  });

  return NextResponse.json({ ok: true, assignments: formatted });
}
