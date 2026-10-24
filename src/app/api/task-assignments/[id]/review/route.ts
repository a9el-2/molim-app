import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import {
  decideReviewPermission,
  mapReviewError,
} from "../../../../lib/task-assignments-policy";
import type { UserRole } from "../../../../lib/roles";

/**
 * POST /api/task-assignments/[id]/review
 * مراجعة تسليم المهمة (اعتماد / طلب تعديل / رفض نهائي).
 * الجسم: { decision: "approve" | "revise" | "reject_final", notes?: string, approvedHours?: number }
 * يستدعي دالة review_task_assignment في قاعدة البيانات مع الفحوصات الدقيقة.
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

  // 1) قراءة بيانات المراجع الحقيقية من جدول users
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
  const reviewerDeptId = currentUser.department_id as string | null;

  if (reviewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية مراجعة المهام." },
      { status: 403 }
    );
  }

  // 2) قراءة سجل التكليف وصاحبه ومهمته
  const { data: assignment, error: fetchErr } = await supabase
    .from("task_assignments")
    .select(`
      id,
      task_id,
      user_id,
      status,
      user:users!task_assignments_user_id_fkey (
        id,
        role,
        department_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !assignment || !assignment.user) {
    return NextResponse.json(
      { error: "سجل التكليف غير موجود." },
      { status: 404 }
    );
  }

  const ownerObj = Array.isArray(assignment.user)
    ? assignment.user[0]
    : assignment.user;

  const ownerRole = ownerObj.role as UserRole;
  const ownerDeptId = ownerObj.department_id as string | null;

  // 3) التحقق من وجود سوبر أدمن آخر نشط إذا كان المراجع سوبر أدمن
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

  // 4) فحص صلاحية المراجعة عبر دالة السياسة
  const permission = decideReviewPermission(
    { id: currentUser.id, role: reviewerRole, departmentId: reviewerDeptId },
    { id: ownerObj.id, role: ownerRole, departmentId: ownerDeptId },
    soleActiveSuperAdmin
  );

  if (!permission.allowed) {
    return NextResponse.json(
      { error: permission.message, reason: permission.reason },
      { status: 403 }
    );
  }

  // 5) قراءة جسم الطلب
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const decision = body.decision;
  if (
    decision !== "approve" &&
    decision !== "revise" &&
    decision !== "reject_final"
  ) {
    return NextResponse.json(
      { error: "قرار المراجعة غير صالح. الخيارات المتاحة: approve, revise, reject_final." },
      { status: 400 }
    );
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  const rawApprovedHours = body.approvedHours ?? body.approved_hours;
  const approvedHours =
    rawApprovedHours !== undefined && rawApprovedHours !== null && rawApprovedHours !== ""
      ? Number(rawApprovedHours)
      : null;

  // 6) استدعاء الدالة الذرية في قاعدة البيانات review_task_assignment
  const { data: resultAssignment, error: rpcError } = await supabase.rpc(
    "review_task_assignment",
    {
      p_assignment_id: id,
      p_reviewer_id: currentUser.id,
      p_decision: decision,
      p_notes: notes,
      p_approved_hours: approvedHours,
      p_allow_self: soleActiveSuperAdmin,
    }
  );

  if (rpcError) {
    const mapped = mapReviewError(rpcError.message ?? "");
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  return NextResponse.json({ ok: true, assignment: resultAssignment });
}
