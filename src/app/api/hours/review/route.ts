import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import { decideHoursReview } from "../../../lib/hours-policy";
import { toPolicyStatus } from "../../../lib/hours-payload";
import type { UserRole } from "../../../lib/roles";

/**
 * GET /api/hours/review
 * يعرض الساعات التي يحق للمستخدم الحالي مراجعتها (الحالة in_review فقط)
 * مع اسم صاحب الساعات ورقمه وقسمه.
 * 
 * - يجلب المرشحين من القاعدة بحسب رتبة المراجع:
 *   - رئيس القسم: أعضاء قسمه فقط.
 *   - HR و ADMIN: كل من عداهم.
 *   - SUPER_ADMIN: الكل.
 * - يصفّي كل صف عبر decideHoursReview للتأكد القاطع من الصلاحية.
 * - رتبة المراجع وقسمه وبيانات صاحب الساعات كلها تُقرأ من القاعدة حصراً.
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

  // 1) قراءة بيانات المراجع الحالية من جدول users لضمان الدقة
  const { data: reviewerUser, error: reviewerError } = await supabase
    .from("users")
    .select("id, role, department_id, status")
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

  // المتطوع لا يملك صلاحية مراجعة الساعات
  if (reviewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية مراجعة الساعات." },
      { status: 403 }
    );
  }

  // 2) فحص ما إذا كان هناك SUPER_ADMIN آخر نشط
  let hasOtherActiveSuperAdmin = false;
  if (reviewerRole === "SUPER_ADMIN") {
    const { data: otherAdmins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "SUPER_ADMIN")
      .eq("status", "active")
      .neq("id", reviewerUser.id);

    hasOtherActiveSuperAdmin = (otherAdmins?.length ?? 0) > 0;
  }

  // 3) بناء الاستعلام لجلب السجلات قيد المراجعة (in_review)
  // لا يراجع أحد ساعاته بنفسه (.neq("user_id", reviewerUser.id))
  let query = supabase
    .from("hours_logs")
    .select(`
      id,
      user_id,
      task_id,
      department_id,
      submitted_hours,
      approved_hours,
      date,
      description,
      status,
      is_self_approved,
      created_at,
      users!hours_logs_user_id_fkey (
        id,
        first_name,
        father_name,
        last_name,
        role,
        department_id,
        departments!users_department_id_fkey (
          id,
          name
        )
      )
    `)
    .eq("status", "in_review")
    .neq("user_id", reviewerUser.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  // تصفية أولية بحسب الرتبة لتقليل البيانات المسترجعة
  if (reviewerRole === "DEPARTMENT_HEAD") {
    if (!reviewerDeptId) {
      return NextResponse.json({ ok: true, hours: [] });
    }
    query = query.eq("department_id", reviewerDeptId);
  }

  const { data: rawRows, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json(
      { error: "تعذر جلب سجلات الساعات للمراجعة." },
      { status: 500 }
    );
  }

  // 4) تصفية الصفوف عبر decideHoursReview للتأكد الصارم
  const eligibleHours = [];

  for (const row of rawRows ?? []) {
    // استخراج بيانات المالك المنضمة
    const owner = Array.isArray(row.users) ? row.users[0] : row.users;
    if (!owner) continue;

    const ownerRole = owner.role as UserRole;
    const ownerDeptId = (owner.department_id ?? row.department_id) as string | null;

    // استدعاء decideHoursReview بفحص إجراء approve
    const decision = decideHoursReview({
      reviewerRole,
      reviewerId: reviewerUser.id,
      reviewerDepartmentId: reviewerDeptId,
      ownerRole,
      ownerId: row.user_id,
      ownerDepartmentId: ownerDeptId,
      currentStatus: toPolicyStatus(row.status),
      action: "approve",
      submittedHours: Number(row.submitted_hours),
      hasOtherActiveSuperAdmin,
    });

    if (decision.allowed) {
      const ownerDeptObj = Array.isArray(owner.departments)
        ? owner.departments[0]
        : owner.departments;

      const ownerName = [owner.first_name, owner.father_name, owner.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      eligibleHours.push({
        id: row.id,
        user_id: row.user_id,
        user_name: ownerName || row.user_id,
        user_number: owner.id,
        department_id: ownerDeptId,
        department_name: ownerDeptObj?.name ?? null,
        task_id: row.task_id,
        submitted_hours: Number(row.submitted_hours),
        approved_hours: row.approved_hours !== null ? Number(row.approved_hours) : null,
        date: row.date,
        description: row.description,
        status: row.status,
        is_self_approved: row.is_self_approved,
        created_at: row.created_at,
      });
    }
  }

  return NextResponse.json({ ok: true, hours: eligibleHours });
}
