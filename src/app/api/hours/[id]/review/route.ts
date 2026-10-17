import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import { decideHoursReview } from "../../../../lib/hours-policy";
import {
  toPolicyStatus,
  buildHoursReviewPayload,
  buildAuditLogPayload,
} from "../../../../lib/hours-payload";
import type { UserRole } from "../../../../lib/roles";

/**
 * POST /api/hours/[id]/review
 * اعتماد أو رفض سجل ساعات تطوعية.
 * 
 * القواعد الصارمة:
 * 1. الجسم: action ("approve" | "reject")، approvedHours (اختياري عند الاعتماد)، note.
 * 2. قراءة السجل وصاحبه من القاعدة، وعدم الثقة بأي رتبة أو قسم أو حالة من العميل.
 * 3. تحويل in_review إلى pending عند استدعاء decideHoursReview، والتحويل العكسي عند الحفظ.
 * 4. حساب hasOtherActiveSuperAdmin من القاعدة.
 * 5. أخطاء decideHoursReview:
 *    - invalid_hours أو missing_note -> 400.
 *    - باقي أخطاء الصلاحية -> 403.
 *    - السجل غير الموجود أو الذي لا يحق للمراجع رؤيته -> 404 (سجل الساعات غير موجود).
 * 6. التحديث بشرط .eq("status", existingRecord.status) مع maybeSingle لمنع التداخل (409).
 * 7. سجل تدقيق إجباري (approve_hours أو reject_hours)، مع التراجع المشروط عند الفشل ومعالجة rollbackError.
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

  if (reviewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية مراجعة الساعات." },
      { status: 403 }
    );
  }

  // 2) قراءة سجل الساعات المطلوب مراجعته مع بيانات صاحبه
  const { data: existingRecord, error: fetchError } = await supabase
    .from("hours_logs")
    .select(`
      *,
      users!hours_logs_user_id_fkey (
        id,
        role,
        department_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existingRecord || !existingRecord.users) {
    return NextResponse.json(
      { error: "سجل الساعات غير موجود." },
      { status: 404 }
    );
  }

  const owner = Array.isArray(existingRecord.users)
    ? existingRecord.users[0]
    : existingRecord.users;

  const ownerRole = owner.role as UserRole;
  const ownerDeptId = (owner.department_id ?? existingRecord.department_id) as string | null;

  // 3) التحقق من وجود رئيس عام آخر نشط إذا كان أحد الطرفين SUPER_ADMIN
  let hasOtherActiveSuperAdmin = false;
  if (reviewerRole === "SUPER_ADMIN" || ownerRole === "SUPER_ADMIN") {
    const { data: otherAdmins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "SUPER_ADMIN")
      .eq("status", "active")
      .neq("id", existingRecord.user_id);

    hasOtherActiveSuperAdmin = (otherAdmins?.length ?? 0) > 0;
  }

  // 4) فحص أولي: هل يحق للمراجع رؤية هذا السجل؟
  // نمرر currentStatus: "pending" عمداً بدلاً من حالة السجل الحقيقية؛
  // حتى لا تؤثر حالة السجل (مثل rejected أو approved) على فحص الصلاحية الأساسي وتتسبب في إرجاع 400/403،
  // مما قد يكشف وجود السجل لمراجع غير مخوّل به أصلاً (منع تسريب وجود السجلات لمراجع غير مصرح له).
  // الفحص اللاحق (reviewDecision) هو الذي سيفحص الحالة الحقيقية للسجل.
  const visibilityCheck = decideHoursReview({
    reviewerRole,
    reviewerId: reviewerUser.id,
    reviewerDepartmentId: reviewerDeptId,
    ownerRole,
    ownerId: existingRecord.user_id,
    ownerDepartmentId: ownerDeptId,
    currentStatus: "pending",
    action: "approve",
    submittedHours: Number(existingRecord.submitted_hours),
    hasOtherActiveSuperAdmin,
  });

  if (
    !visibilityCheck.allowed &&
    (visibilityCheck.reason === "self_review" ||
      visibilityCheck.reason === "role_not_allowed" ||
      visibilityCheck.reason === "department_mismatch")
  ) {
    return NextResponse.json(
      { error: "سجل الساعات غير موجود." },
      { status: 404 }
    );
  }

  // 5) قراءة جسم الطلب
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = body.action === "reject" ? "reject" : body.action === "approve" ? "approve" : null;
  if (!action) {
    return NextResponse.json(
      { error: "إجراء المراجعة غير صالح. يجب أن يكون approve أو reject." },
      { status: 400 }
    );
  }

  const rawApprovedHours = body.approvedHours ?? body.approved_hours;
  const approvedHours =
    rawApprovedHours !== undefined && rawApprovedHours !== null
      ? Number(rawApprovedHours)
      : undefined;

  const note =
    typeof body.note === "string"
      ? body.note
      : typeof body.reviewNotes === "string"
      ? body.reviewNotes
      : typeof body.review_notes === "string"
      ? body.review_notes
      : undefined;

  // 6) التحقق الشامل عبر decideHoursReview
  const reviewDecision = decideHoursReview({
    reviewerRole,
    reviewerId: reviewerUser.id,
    reviewerDepartmentId: reviewerDeptId,
    ownerRole,
    ownerId: existingRecord.user_id,
    ownerDepartmentId: ownerDeptId,
    currentStatus: toPolicyStatus(existingRecord.status),
    action,
    submittedHours: Number(existingRecord.submitted_hours),
    approvedHours,
    note,
    hasOtherActiveSuperAdmin,
  });

  if (!reviewDecision.allowed) {
    const statusCode =
      reviewDecision.reason === "invalid_hours" || reviewDecision.reason === "missing_note"
        ? 400
        : 403;

    return NextResponse.json(
      { error: reviewDecision.message, reason: reviewDecision.reason },
      { status: statusCode }
    );
  }

  // 7) بناء حمولة المراجعة (لا تمس submitted_hours ولا is_self_approved)
  const reviewPayload = buildHoursReviewPayload({
    action,
    submittedHours: Number(existingRecord.submitted_hours),
    approvedHours,
    note,
    reviewerId: reviewerUser.id,
  });

  // 8) التحديث في قاعدة البيانات مع شرط التزامن (.eq("status", existingRecord.status))
  const { data: updatedRecord, error: updateError } = await supabase
    .from("hours_logs")
    .update(reviewPayload)
    .eq("id", id)
    .eq("status", existingRecord.status)
    .select()
    .maybeSingle();

  if (updateError || !updatedRecord) {
    if (updateError) {
      return NextResponse.json(
        { error: "تعذر تحديث حالة السجل. حاول مرة أخرى." },
        { status: 500 }
      );
    }
    // لم يطابق شرط الحالة الأصلية -> 409
    return NextResponse.json(
      { error: "تغيّرت حالة السجل أثناء المراجعة. حدّث الصفحة." },
      { status: 409 }
    );
  }

  // 9) تسجيل سجل التدقيق audit_logs
  // نجهز نسخة من existingRecord بدون حقل users المضاف من JOIN
  const { users: _joinedUsers, ...cleanBeforeData } = existingRecord;

  const auditAction = action === "approve" ? "approve_hours" : "reject_hours";
  const auditDetails =
    action === "approve"
      ? `اعتماد الساعات: ${updatedRecord.approved_hours} ساعة معتمدة (من أصل ${existingRecord.submitted_hours})`
      : `رفض الساعات: ${existingRecord.submitted_hours} ساعة`;

  const auditPayload = buildAuditLogPayload({
    actorId: reviewerUser.id,
    action: auditAction,
    targetId: String(id),
    targetUserId: existingRecord.user_id,
    departmentId: existingRecord.department_id,
    beforeData: cleanBeforeData,
    afterData: updatedRecord,
    details: auditDetails,
  });

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditError) {
    // التراجع عن التعديل إذا فشل التدقيق بشرط ألا يكون قد تغيّر في الأثناء
    const { error: rollbackError } = await supabase
      .from("hours_logs")
      .update({
        status: existingRecord.status,
        approved_hours: existingRecord.approved_hours,
        reviewed_by: existingRecord.reviewed_by,
        reviewed_at: existingRecord.reviewed_at,
        review_notes: existingRecord.review_notes,
        updated_at: existingRecord.updated_at,
      })
      .eq("id", id)
      .eq("status", updatedRecord.status);

    if (rollbackError) {
      console.error(
        "[POST /api/hours/%s/review] فشل التراجع عن المراجعة بعد خطأ في سجل التدقيق:",
        id,
        rollbackError
      );
      return NextResponse.json(
        {
          error:
            "تعذر توثيق العملية وتعذر التراجع عن التعديل. تواصل مع الإدارة.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          "تعذر توثيق العملية في سجل التدقيق. أُلغيت العملية للحفاظ على النزاهة.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, hour: updatedRecord });
}
