/**
 * دوال نقية بلا قاعدة بيانات لسياسات تكليفات المهام:
 * - SEAT_STATUSES: حالات التكليف التي تُعد مقعداً مشغولاً للمهمة.
 * - validateNewTaskFields: التحقق من حقول إنشاء المهمة الجديدة.
 * - mapClaimError: تحويل رسالة خطأ claim_task إلى استجابة HTTP.
 * - canViewTaskAssignments: هل يحق للمشاهد رؤية تكليفات مستخدم آخر.
 * - isTaskAvailableForUser: تحديد ما إذا كانت المهمة متاحة لاستلام العضو.
 * - decideTaskAssignmentToPerson: تحديد صلاحية توجيه مهمة لعضو محدد.
 */

import { isValidISODate } from "./hours-policy.ts";
import type { UserRole } from "./roles.ts";
import type { TaskDbTargetType } from "./tasks-payload.ts";

// ─────────────────────────────────────────────────────────────
// SEAT_STATUSES: الحالات التي تُعد مقعداً مشغولاً للمهمة
// المرجع: db/planned/0003b_tasks_assignments.sql
// ─────────────────────────────────────────────────────────────
export const SEAT_STATUSES = [
  "in_progress",
  "submitted",
  "needs_revision",
  "approved",
] as const;

export type SeatStatus = (typeof SEAT_STATUSES)[number];

// ─────────────────────────────────────────────────────────────
// validateNewTaskFields
// ─────────────────────────────────────────────────────────────

export type NewTaskFieldsInput = {
  title: unknown;
  description?: unknown;
  requiredAssignees?: unknown;
  priority?: unknown;
  dueDate?: unknown;
};

export type FieldValidationResult =
  | { valid: true }
  | { valid: false; field: string; message: string };

/**
 * التحقق من حقول إنشاء مهمة جديدة (نقية – بلا قاعدة بيانات):
 * - title: إجباري, حتى 150 حرفاً.
 * - description: اختياري, حتى 2000 حرف.
 * - requiredAssignees: null (بلا حد) أو عدد صحيح من 1 إلى 50.
 * - priority: "normal" | "urgent".
 * - dueDate: اختياري, صيغة YYYY-MM-DD صحيحة, لا يكون قبل اليوم بتوقيت Asia/Riyadh.
 */
export function validateNewTaskFields(
  input: NewTaskFieldsInput,
  now: Date = new Date()
): FieldValidationResult {
  // ── title ──
  if (typeof input.title !== "string" || !input.title.trim()) {
    return { valid: false, field: "title", message: "عنوان المهمة مطلوب ولا يمكن أن يكون فارغاً." };
  }
  if (input.title.trim().length > 150) {
    return { valid: false, field: "title", message: "عنوان المهمة طويل جداً (الحد الأقصى 150 حرفاً)." };
  }

  // ── description ──
  if (
    input.description !== undefined &&
    input.description !== null &&
    input.description !== ""
  ) {
    if (typeof input.description !== "string") {
      return { valid: false, field: "description", message: "وصف المهمة يجب أن يكون نصياً." };
    }
    if (input.description.trim().length > 2000) {
      return { valid: false, field: "description", message: "وصف المهمة طويل جداً (الحد الأقصى 2000 حرف)." };
    }
  }

  // ── requiredAssignees ──
  if (
    input.requiredAssignees !== undefined &&
    input.requiredAssignees !== null
  ) {
    const val = Number(input.requiredAssignees);
    if (
      !Number.isInteger(val) ||
      Number.isNaN(val) ||
      val < 1 ||
      val > 50
    ) {
      return {
        valid: false,
        field: "requiredAssignees",
        message: "عدد المستلمين المطلوبين يجب أن يكون عدداً صحيحاً من 1 إلى 50، أو null لبلا حد.",
      };
    }
  }

  // ── priority ──
  if (input.priority !== undefined && input.priority !== null) {
    if (input.priority !== "normal" && input.priority !== "urgent") {
      return {
        valid: false,
        field: "priority",
        message: "أولوية المهمة يجب أن تكون normal أو urgent.",
      };
    }
  }

  // ── dueDate ──
  if (
    input.dueDate !== undefined &&
    input.dueDate !== null &&
    input.dueDate !== ""
  ) {
    if (typeof input.dueDate !== "string" || !isValidISODate(input.dueDate.trim())) {
      return {
        valid: false,
        field: "dueDate",
        message: "تاريخ الاستحقاق غير صالح (يجب أن يكون بصيغة YYYY-MM-DD وتاريخاً تقويمياً صحيحة).",
      };
    }

    // لا يكون قبل اليوم بتوقيت Asia/Riyadh
    const todayRiyadh = now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Riyadh",
    });
    const dueDateStr = input.dueDate.trim();
    if (dueDateStr < todayRiyadh) {
      return {
        valid: false,
        field: "dueDate",
        message: "تاريخ الاستحقاق لا يمكن أن يكون في الماضي.",
      };
    }
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────
// mapClaimError
// ─────────────────────────────────────────────────────────────

export type ClaimErrorResponse = {
  status: 403 | 404 | 409 | 500;
  code: string;
  message: string;
};

/**
 * تحويل رسالة خطأ دالة claim_task إلى استجابة HTTP موحّدة.
 * لا تُسرَّب تفاصيل الأخطاء غير المتوقعة للعميل.
 */
export function mapClaimError(message: string): ClaimErrorResponse {
  if (
    message.startsWith("TASK_NOT_FOUND") ||
    message.startsWith("USER_NOT_FOUND") ||
    message.startsWith("ASSIGNMENT_NOT_FOUND")
  ) {
    return { status: 404, code: message.split(":")[0].trim(), message: "المورد المطلوب غير موجود." };
  }

  if (message.startsWith("TASK_NOT_OPEN")) {
    return { status: 409, code: "TASK_NOT_OPEN", message: "المهمة غير متاحة للاستلام حالياً." };
  }

  if (message.startsWith("TASK_FULL")) {
    return { status: 409, code: "TASK_FULL", message: "وصلت المهمة إلى الحد الأقصى من المستلمين." };
  }

  if (message.startsWith("ALREADY_ASSIGNED")) {
    return { status: 409, code: "ALREADY_ASSIGNED", message: "أنت مسجّل بالفعل في هذه المهمة." };
  }

  if (message.startsWith("ACTIVE_LIMIT")) {
    return { status: 409, code: "ACTIVE_LIMIT", message: "وصلت إلى الحد الأقصى من المهام النشطة المسموح بها." };
  }

  if (message.startsWith("NOT_ELIGIBLE")) {
    return { status: 403, code: "NOT_ELIGIBLE", message: "لا تستوفي شروط الاستلام لهذه المهمة." };
  }

  // أي خطأ آخر غير متوقع → 500 بدون تسريب تفاصيل
  return { status: 500, code: "INTERNAL_ERROR", message: "حدث خطأ غير متوقع. حاول مرة أخرى لاحقاً." };
}

// ─────────────────────────────────────────────────────────────
// canViewTaskAssignments
// ─────────────────────────────────────────────────────────────

export type ViewerInfo = {
  id: string;
  role: UserRole;
  departmentId: string | null;
};

export type TargetUserInfo = {
  id: string;
  departmentId: string | null;
};

/**
 * هل يحق للمشاهد (viewer) رؤية تكليفات المستخدم المستهدف (targetUser)؟
 * - العضو يرى نفسه فقط.
 * - رئيس القسم يرى أعضاء قسمه فقط (يشترط تطابق departmentId).
 * - HR و ADMIN و SUPER_ADMIN يرون الجميع.
 */
export function canViewTaskAssignments(
  viewer: ViewerInfo,
  targetUser: TargetUserInfo
): boolean {
  // المستخدم يرى نفسه دائماً
  if (viewer.id === targetUser.id) return true;

  // الأدوار العليا ترى الجميع
  if (
    viewer.role === "HR" ||
    viewer.role === "ADMIN" ||
    viewer.role === "SUPER_ADMIN"
  ) {
    return true;
  }

  // رئيس القسم يرى أعضاء قسمه فقط
  if (viewer.role === "DEPARTMENT_HEAD") {
    if (
      viewer.departmentId !== null &&
      viewer.departmentId === targetUser.departmentId
    ) {
      return true;
    }
    return false;
  }

  // VOLUNTEER والأدوار الأخرى: لا يرون إلا أنفسهم (معالج بالشرط الأول)
  return false;
}

// ─────────────────────────────────────────────────────────────
// isTaskAvailableForUser
// ─────────────────────────────────────────────────────────────

export type TaskAvailableCandidate = {
  id: string | number;
  lifecycle_status?: string | null;
  target_type: TaskDbTargetType | string | null;
  created_by?: string | null;
  target_user_id?: string | null;
  department_id?: string | null;
  target_department_ids?: string[] | unknown;
};

export type UserAvailableCandidate = {
  id: string;
  role: UserRole;
  departmentId: string | null;
  status: string;
};

/**
 * فحص احتواء target_department_ids على معرّف القسم المطلوب.
 * يتعامل بأمان مع المصفوفات ونصوص JSON.
 */
export function containsDepartment(
  targetDepartmentIds: unknown,
  departmentId: string | null | undefined
): boolean {
  if (!departmentId || !departmentId.trim()) return false;
  if (!targetDepartmentIds) return false;

  let list: unknown[] = [];
  if (Array.isArray(targetDepartmentIds)) {
    list = targetDepartmentIds;
  } else if (typeof targetDepartmentIds === "string") {
    try {
      const parsed = JSON.parse(targetDepartmentIds);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      // ليس JSON صالحاً، قد يكون نصاً عادياً لمعرف قسم مفرد
      if (targetDepartmentIds.trim() === departmentId.trim()) return true;
    }
  }

  return list.some((item) => String(item).trim() === departmentId.trim());
}

/**
 * هل المهمة متاحة للعرض والاستلام من قبل المستخدم الحالي؟ (دالة نقية)
 * - العضو يجب أن يكون نشطاً (status === "active").
 * - دورة حياة المهمة يجب أن تكون مفتوحة (lifecycle_status === "open").
 * - الأنواع:
 *    * self: لا تظهر لغير صاحبها (created_by أو target_user_id).
 *    * person: لا تظهر (تُوجّه مباشرة للعضو كعرض offered ولا تُعرض للاستلام العام).
 *    * department: لقسم العضو (عبر department_id أو target_department_ids).
 *    * multiple_departments: فحص target_department_ids.
 *    * all_departments: لأي عضو نشط.
 *    * upper_management: محصورة بـ ADMIN و SUPER_ADMIN فقط.
 */
export function isTaskAvailableForUser(
  task: TaskAvailableCandidate,
  user: UserAvailableCandidate
): boolean {
  // العضو يجب أن يكون نشطاً دائماً
  if (String(user.status ?? "").toLowerCase() !== "active") {
    return false;
  }

  // دورة حياة المهمة يجب أن تكون مفتوحة
  if (task.lifecycle_status && task.lifecycle_status !== "open") {
    return false;
  }

  const targetType = task.target_type;

  // 1) self: لا تظهر لغير صاحبها
  if (targetType === "self") {
    return task.created_by === user.id || task.target_user_id === user.id;
  }

  // 2) person: لا تظهر في قائمة المهام المتاحة للاستلام العام
  if (targetType === "person") {
    return false;
  }

  // 3) department: مهمة لقسم العضو
  if (targetType === "department") {
    if (!user.departmentId) return false;
    if (task.department_id && task.department_id === user.departmentId) {
      return true;
    }
    return containsDepartment(task.target_department_ids, user.departmentId);
  }

  // 4) multiple_departments: فحص وجود قسم العضو في target_department_ids
  if (targetType === "multiple_departments") {
    if (!user.departmentId) return false;
    return containsDepartment(task.target_department_ids, user.departmentId);
  }

  // 5) all_departments: متاحة لأي عضو نشط
  if (targetType === "all_departments") {
    return true;
  }

  // 6) upper_management: ADMIN و SUPER_ADMIN فقط
  if (targetType === "upper_management") {
    return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// decideTaskAssignmentToPerson
// ─────────────────────────────────────────────────────────────

export type PersonAssignmentDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string };

/**
 * تحديد صلاحية توجيه مهمة لعضو محدد (دالة نقية):
 * - DEPARTMENT_HEAD: لأعضاء قسمه فقط.
 * - HR و ADMIN و SUPER_ADMIN: لأي عضو.
 * - VOLUNTEER (وغيرهم): لا يملكون صلاحية توجيه مهام لأعضاء آخرين (إلا لأنفسهم عبر scope=self).
 */
export function decideTaskAssignmentToPerson(
  requesterRole: UserRole,
  requesterDepartmentId: string | null,
  targetDepartmentId: string | null
): PersonAssignmentDecision {
  if (
    requesterRole === "HR" ||
    requesterRole === "ADMIN" ||
    requesterRole === "SUPER_ADMIN"
  ) {
    return { allowed: true };
  }

  if (requesterRole === "DEPARTMENT_HEAD") {
    if (!requesterDepartmentId || requesterDepartmentId !== targetDepartmentId) {
      return {
        allowed: false,
        reason: "department_mismatch",
        message: "رئيس القسم يمكنه تكليف أعضاء قسمه فقط.",
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "role_not_allowed",
    message: "لا تملك الصلاحية لتكليف مهمة لعضو آخر.",
  };
}

// ─────────────────────────────────────────────────────────────
// نوع الحمولة الصارم لإنشاء المهمة الجديدة
// ─────────────────────────────────────────────────────────────

export type TaskAssignmentTaskInsertPayload = {
  title: string;
  description: string | null;
  target_type: TaskDbTargetType;
  target_user_id: string | null;
  target_department_ids: string[];
  department_id: string | null;
  lifecycle_status: "open";
  requested_hours: number | null;
  due_date: string | null;
  created_by: string;
  assigned_to: string | null;
  required_assignees: number | null;
  priority: "normal" | "urgent";
  reviewed_by: null;
  reviewed_at: null;
  review_decision: null;
  review_reason: null;
};

// ─────────────────────────────────────────────────────────────
// 1) validateReason
// ─────────────────────────────────────────────────────────────

export type ReasonValidationResult =
  | { valid: true; reason: string }
  | { valid: false; message: string };

/**
 * التحقق من نص السبب (نقية – بلا قاعدة بيانات):
 * - إجباري بعد trim لا يقل عن 10 أحرف ولا يزيد عن 1000 حرف.
 * - يطابق قيد قاعدة البيانات: length(btrim(status_reason)) >= 10
 */
export function validateReason(text: unknown): ReasonValidationResult {
  if (typeof text !== "string") {
    return { valid: false, message: "السبب مطلوب ويجب أن يكون نصياً." };
  }
  const trimmed = text.trim();
  if (trimmed.length < 10) {
    return { valid: false, message: "السبب مطلوب ويجب ألا يقل عن 10 أحرف." };
  }
  if (trimmed.length > 1000) {
    return { valid: false, message: "السبب طويل جداً (الحد الأقصى 1000 حرف)." };
  }
  return { valid: true, reason: trimmed };
}

// ─────────────────────────────────────────────────────────────
// 2) mapReviewError
// ─────────────────────────────────────────────────────────────

export type ReviewErrorResponse = {
  status: 400 | 403 | 404 | 409 | 500;
  code: string;
  message: string;
};

/**
 * تحويل أخطاء دالة review_task_assignment إلى استجابة HTTP:
 * - ASSIGNMENT_NOT_FOUND و TASK_NOT_FOUND → 404
 * - NOT_SUBMITTED → 409
 * - SELF_REVIEW → 403
 * - NOTES_REQUIRED و INVALID_HOURS و INVALID_DECISION → 400
 * - أي شيء آخر → 500 برسالة عامة
 */
export function mapReviewError(message: string): ReviewErrorResponse {
  if (
    message.startsWith("ASSIGNMENT_NOT_FOUND") ||
    message.startsWith("TASK_NOT_FOUND")
  ) {
    const code = message.split(":")[0].trim();
    const msg =
      code === "TASK_NOT_FOUND"
        ? "المهمة المرتبطة بالسجل غير موجودة."
        : "سجل التكليف المطلوب غير موجود.";
    return { status: 404, code, message: msg };
  }

  if (message.startsWith("NOT_SUBMITTED")) {
    return {
      status: 409,
      code: "NOT_SUBMITTED",
      message: "سجل التكليف ليس بحالة التسليم أو تغيرت حالته.",
    };
  }

  if (message.startsWith("SELF_REVIEW")) {
    return {
      status: 403,
      code: "SELF_REVIEW",
      message: "لا يجوز مراجعة مهمتك بنفسك.",
    };
  }

  if (message.startsWith("NOTES_REQUIRED")) {
    return {
      status: 400,
      code: "NOTES_REQUIRED",
      message: "الملاحظات مطلوبة ولا تقل عن 10 أحرف عند طلب التعديل أو الرفض النهائي.",
    };
  }

  if (message.startsWith("INVALID_HOURS")) {
    return {
      status: 400,
      code: "INVALID_HOURS",
      message: "الساعات المعتمدة يجب أن تكون بين 0.25 و 24 ومضاعف دقيق لـ 0.25.",
    };
  }

  if (message.startsWith("INVALID_DECISION")) {
    return {
      status: 400,
      code: "INVALID_DECISION",
      message: "قرار المراجعة غير صالح (يجب أن يكون approve أو revise أو reject_final).",
    };
  }

  // أي خطأ آخر غير متوقع
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "حدث خطأ غير متوقع أثناء معالجة المراجعة.",
  };
}

// ─────────────────────────────────────────────────────────────
// 3) decideAssignmentAction
// ─────────────────────────────────────────────────────────────

export type AssignmentActionType = "decline" | "withdraw" | "submit";

export type AssignmentActor = {
  id: string;
  status: string;
};

export type TargetAssignment = {
  id: string;
  user_id: string;
  status: string;
};

export type AssignmentActionDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string; statusCode: 403 | 409 };

/**
 * تحديد صلاحية تنفيذ الإجراءات على التكليف (decline, withdraw, submit):
 * - صاحب التكليف فقط.
 * - العضو يجب أن يكون حسابه نشطاً (status === "active").
 * - decline: من حالة offered فقط.
 * - withdraw: من حالة in_progress أو needs_revision.
 * - submit: من حالة in_progress أو needs_revision.
 */
export function decideAssignmentAction(
  actor: AssignmentActor,
  assignment: TargetAssignment,
  action: AssignmentActionType
): AssignmentActionDecision {
  // فحص الملكية: صاحب التكليف فقط
  if (actor.id !== assignment.user_id) {
    return {
      allowed: false,
      reason: "not_owner",
      message: "لا يمكنك تنفيذ هذا الإجراء إلا على تكليفك الخاص.",
      statusCode: 403,
    };
  }

  // فحص حالة العضو: يجب أن يكون نشطاً
  if (String(actor.status ?? "").toLowerCase() !== "active") {
    return {
      allowed: false,
      reason: "inactive_user",
      message: "حسابك غير نشط.",
      statusCode: 403,
    };
  }

  if (action === "decline") {
    if (assignment.status !== "offered") {
      return {
        allowed: false,
        reason: "invalid_status",
        message: "يمكنك الاعتذار عن التكليف عندما يكون معروضاً عليك فقط (offered).",
        statusCode: 409,
      };
    }
    return { allowed: true };
  }

  if (action === "withdraw") {
    if (
      assignment.status !== "in_progress" &&
      assignment.status !== "needs_revision"
    ) {
      return {
        allowed: false,
        reason: "invalid_status",
        message: "الانسحاب متاح فقط عندما تكون المهمة قيد التنفيذ أو قيد التعديل.",
        statusCode: 409,
      };
    }
    return { allowed: true };
  }

  if (action === "submit") {
    if (
      assignment.status !== "in_progress" &&
      assignment.status !== "needs_revision"
    ) {
      return {
        allowed: false,
        reason: "invalid_status",
        message: "تسليم المهمة متاح فقط عندما تكون قيد التنفيذ أو قيد التعديل.",
        statusCode: 409,
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "invalid_action",
    message: "إجراء التكليف غير صالح.",
    statusCode: 403,
  };
}

// ─────────────────────────────────────────────────────────────
// 4) decideReviewPermission
// ─────────────────────────────────────────────────────────────

export type ReviewerUser = {
  id: string;
  role: UserRole;
  departmentId: string | null;
};

export type AssignmentOwnerUser = {
  id: string;
  role: UserRole;
  departmentId: string | null;
};

export type ReviewPermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string };

/**
 * تحديد صلاحية مراجعة التكليف (دالة نقية):
 * - المتطوع لا يملك صلاحية المراجعة.
 * - لا أحد يراجع تكليفه بنفسه إلا SUPER_ADMIN الوحيد النشط في النظام (soleActiveSuperAdmin).
 * - رئيس القسم (DEPARTMENT_HEAD): يراجع فقط عضواً ينتمي لنفس قسمه (owner.departmentId === reviewer.departmentId).
 * - HR و ADMIN: يراجعون VOLUNTEER و DEPARTMENT_HEAD فقط، ولا يراجعون HR أو ADMIN أو SUPER_ADMIN.
 * - SUPER_ADMIN: يراجع الجميع عدا نفسه (إلا إن كان الوحيد النشط).
 */
export function decideReviewPermission(
  reviewer: ReviewerUser,
  assignmentOwner: AssignmentOwnerUser,
  soleActiveSuperAdmin: boolean = false
): ReviewPermissionDecision {
  if (reviewer.role === "VOLUNTEER") {
    return {
      allowed: false,
      reason: "role_not_allowed",
      message: "المتطوع لا يملك صلاحية مراجعة المهام.",
    };
  }

  // المراجعة الذاتية
  if (reviewer.id === assignmentOwner.id) {
    if (reviewer.role === "SUPER_ADMIN" && soleActiveSuperAdmin) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "self_review",
      message: "لا يجوز مراجعة مهمتك بنفسك.",
    };
  }

  // فحص الصلاحية بحسب دور صاحب التكليف
  if (assignmentOwner.role === "VOLUNTEER") {
    if (reviewer.role === "DEPARTMENT_HEAD") {
      if (
        !reviewer.departmentId ||
        !assignmentOwner.departmentId ||
        reviewer.departmentId !== assignmentOwner.departmentId
      ) {
        return {
          allowed: false,
          reason: "department_mismatch",
          message: "رئيس القسم يراجع تكليفات أعضاء قسمه فقط.",
        };
      }
      return { allowed: true };
    }
    // HR, ADMIN, SUPER_ADMIN مسموح لهم
    return { allowed: true };
  }

  if (assignmentOwner.role === "DEPARTMENT_HEAD") {
    if (reviewer.role === "DEPARTMENT_HEAD") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "رئيس القسم لا يراجع تكليفات رئيس قسم آخر.",
      };
    }
    // HR, ADMIN, SUPER_ADMIN مسموح لهم
    return { allowed: true };
  }

  if (assignmentOwner.role === "HR" || assignmentOwner.role === "ADMIN") {
    if (reviewer.role !== "SUPER_ADMIN") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "تكليفات مسؤولي الموارد البشرية والإدارة العليا يراجعها الرئيس العام فقط.",
      };
    }
    return { allowed: true };
  }

  if (assignmentOwner.role === "SUPER_ADMIN") {
    if (reviewer.role !== "SUPER_ADMIN") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "تكليفات الرئيس العام يراجعها رئيس عام آخر فقط.",
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "role_not_allowed",
    message: "لا تملك الصلاحية لمراجعة هذا التكليف.",
  };
}

// ─────────────────────────────────────────────────────────────
// 5) decideTaskReassignment
// ─────────────────────────────────────────────────────────────

export type ReassignActor = {
  id: string;
  role: UserRole;
  departmentId: string | null;
  status: string;
};

export type ReassignCurrentAssignment = {
  id: string;
  user_id: string;
  status: string;
};

export type ReassignTaskInfo = {
  id: string;
  target_type: string | null;
  lifecycle_status: string | null;
  created_by: string | null;
};

export type ReassignTargetUser = {
  id: string;
  role: UserRole;
  departmentId: string | null;
  status: string;
};

export type ReassignmentDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string; statusCode: 400 | 403 | 404 | 409 };

/**
 * فحص صلاحية إعادة توجيه مهمة شخصية (person) اعتذر عنها العضو السابق (نقية – بلا قاعدة بيانات):
 * - المستخدم الفاعل نشط (status === "active").
 * - التكليف الحالي حالته declined.
 * - المهمة نوعها person ومفتوحة lifecycle_status === "open".
 * - الفاعل هو منشئ المهمة (created_by) أو دوره ADMIN أو SUPER_ADMIN أو HR.
 * - العضو المستهدف الجديد ليس نفس العضو المعتذر.
 * - العضو المستهدف الجديد حسابه نشط.
 * - الفاعل يملك صلاحية تكليف العضو المستهدف (عبر decideTaskAssignmentToPerson).
 */
export function decideTaskReassignment(
  actor: ReassignActor,
  assignment: ReassignCurrentAssignment,
  task: ReassignTaskInfo,
  targetUser: ReassignTargetUser
): ReassignmentDecision {
  if (String(actor.status ?? "").toLowerCase() !== "active") {
    return {
      allowed: false,
      reason: "inactive_actor",
      message: "حسابك غير نشط.",
      statusCode: 403,
    };
  }

  if (assignment.status !== "declined") {
    return {
      allowed: false,
      reason: "invalid_status",
      message: "إعادة التوجيه متاحة فقط عندما يكون التكليف الحالي معتذراً عنه (declined).",
      statusCode: 409,
    };
  }

  if (task.target_type !== "person") {
    return {
      allowed: false,
      reason: "invalid_target_type",
      message: "إعادة التوجيه متاحة فقط للمهام الموجهة لأشخاص محددين (person).",
      statusCode: 400,
    };
  }

  if (task.lifecycle_status !== "open") {
    return {
      allowed: false,
      reason: "task_not_open",
      message: "المهمة ليست مفتوحة لإعادة التوجيه.",
      statusCode: 409,
    };
  }

  // الفاعل: منشئ المهمة أو ADMIN أو SUPER_ADMIN أو HR
  const isCreator = task.created_by === actor.id;
  const isHighRole =
    actor.role === "ADMIN" ||
    actor.role === "SUPER_ADMIN" ||
    actor.role === "HR";

  if (!isCreator && !isHighRole) {
    return {
      allowed: false,
      reason: "role_not_allowed",
      message: "غير مصرح لك بإعادة توجيه هذه المهمة (يجب أن تكون المنشئ أو الإدارة).",
      statusCode: 403,
    };
  }

  if (targetUser.id === assignment.user_id) {
    return {
      allowed: false,
      reason: "same_declined_user",
      message: "لا يمكن إعادة توجيه المهمة لنفس العضو الذي اعتذر عنها.",
      statusCode: 400,
    };
  }

  if (String(targetUser.status ?? "").toLowerCase() !== "active") {
    return {
      allowed: false,
      reason: "inactive_target_user",
      message: "المستخدم المستهدف غير نشط.",
      statusCode: 403,
    };
  }

  // التحقق من الصلاحية حسب الأقسام
  const personDecision = decideTaskAssignmentToPerson(
    actor.role,
    actor.departmentId,
    targetUser.departmentId
  );

  if (!personDecision.allowed) {
    return {
      allowed: false,
      reason: personDecision.reason,
      message: personDecision.message,
      statusCode: 403,
    };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────
// 6) mapManageError
// ─────────────────────────────────────────────────────────────

export type ManageErrorResponse = {
  status: 400 | 404 | 409 | 500;
  code: string;
  message: string;
};

/**
 * تحويل أخطاء دوال إدارة وسحب وإلغاء المهام (0004) إلى استجابة HTTP:
 * - REASON_REQUIRED → 400
 * - INVALID_STATUS → 409
 * - ASSIGNMENT_NOT_FOUND و TASK_NOT_FOUND → 404
 * - غير ذلك → 500 برسالة عامة
 */
export function mapManageError(message: string): ManageErrorResponse {
  if (message.startsWith("REASON_REQUIRED")) {
    return {
      status: 400,
      code: "REASON_REQUIRED",
      message: "السبب مطلوب ويجب ألا يقل عن 10 أحرف.",
    };
  }

  if (message.startsWith("INVALID_STATUS")) {
    return {
      status: 409,
      code: "INVALID_STATUS",
      message: "لا يمكن تنفيذ هذا الإجراء في الحالة الحالية.",
    };
  }

  if (
    message.startsWith("ASSIGNMENT_NOT_FOUND") ||
    message.startsWith("TASK_NOT_FOUND")
  ) {
    const code = message.split(":")[0].trim();
    const msg =
      code === "TASK_NOT_FOUND"
        ? "المهمة المطلوبة غير موجودة."
        : "سجل التكليف المطلوب غير موجود.";
    return { status: 404, code, message: msg };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "حدث خطأ غير متوقع أثناء معالجة العملية.",
  };
}

// ─────────────────────────────────────────────────────────────
// 7) decideReleasePermission
// ─────────────────────────────────────────────────────────────

export type ReleaseActor = {
  id: string;
  role: UserRole;
  departmentId: string | null;
  status: string;
};

export type ReleaseTaskInfo = {
  id: string;
  created_by: string;
  department_id?: string | null;
  target_type?: string | null;
};

export type ReleaseAssignmentOwner = {
  id: string;
  departmentId: string | null;
};

export type ReleaseDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string; statusCode: 403 | 409 };

/**
 * تحديد صلاحية سحب تكليف مهمة من عضو (release_task_assignment):
 * - الفاعل يجب أن يكون نشطاً (active).
 * - لا يجوز لأحد سحب تكليفه بنفسه (self-release).
 * - الصلاحية لـ: منشئ المهمة (tasks.created_by) أو ADMIN أو SUPER_ADMIN أو HR.
 * - رئيس القسم (DEPARTMENT_HEAD) يسحب فقط لعضو قسمه (يشترط تطابق departmentId).
 */
export function decideReleasePermission(
  actor: ReleaseActor,
  task: ReleaseTaskInfo,
  assignmentOwner: ReleaseAssignmentOwner
): ReleaseDecision {
  if (String(actor.status ?? "").toLowerCase() !== "active") {
    return {
      allowed: false,
      reason: "inactive_actor",
      message: "حسابك غير نشط.",
      statusCode: 403,
    };
  }

  // لا أحد يسحب تكليفه بنفسه
  if (actor.id === assignmentOwner.id) {
    return {
      allowed: false,
      reason: "self_release_forbidden",
      message: "لا يجوز سحب تكليفك بنفسك.",
      statusCode: 403,
    };
  }

  // المهام الشخصية لا يسحبها إلا صاحبها (ولا أحد يسحب تكليفه بنفسه أعلاه)
  if (task.target_type === "self" && task.created_by !== actor.id) {
    return {
      allowed: false,
      reason: "personal_task",
      message: "لا يمكن سحب مهمة شخصية خاصة بعضو آخر.",
      statusCode: 403,
    };
  }

  // منشئ المهمة
  if (task.created_by === actor.id) {
    return { allowed: true };
  }

  // الإدارة العليا والموارد البشرية
  if (
    actor.role === "ADMIN" ||
    actor.role === "SUPER_ADMIN" ||
    actor.role === "HR"
  ) {
    return { allowed: true };
  }

  // رئيس القسم لأعضاء قسمه فقط
  if (actor.role === "DEPARTMENT_HEAD") {
    if (
      actor.departmentId !== null &&
      actor.departmentId !== undefined &&
      actor.departmentId === assignmentOwner.departmentId
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "department_mismatch",
      message: "رئيس القسم يمكنه سحب تكليفات أعضاء قسمه فقط.",
      statusCode: 403,
    };
  }

  return {
    allowed: false,
    reason: "role_not_allowed",
    message: "غير مصرح لك بسحب هذا التكليف.",
    statusCode: 403,
  };
}

// ─────────────────────────────────────────────────────────────
// 8) decideCancelPermission
// ─────────────────────────────────────────────────────────────

export type CancelActor = {
  id: string;
  role: UserRole;
  departmentId: string | null;
  status: string;
};

export type CancelTaskInfo = {
  id: string;
  created_by: string;
  department_id: string | null;
  lifecycle_status?: string | null;
  target_type?: string | null;
};

export type CancelDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string; statusCode: 403 | 409 };

/**
 * تحديد صلاحية إلغاء مهمة (cancel_task):
 * - الفاعل يجب أن يكون نشطاً (active).
 * - إذا كانت المهمة ليست مفتوحة (lifecycle_status !== 'open') تُرفض (409).
 * - الصلاحية لـ: منشئ المهمة (tasks.created_by) أو ADMIN أو SUPER_ADMIN أو HR.
 * - رئيس القسم (DEPARTMENT_HEAD) يلغي فقط مهام قسمه (يشترط تطابق departmentId).
 */
export function decideCancelPermission(
  actor: CancelActor,
  task: CancelTaskInfo
): CancelDecision {
  if (String(actor.status ?? "").toLowerCase() !== "active") {
    return {
      allowed: false,
      reason: "inactive_actor",
      message: "حسابك غير نشط.",
      statusCode: 403,
    };
  }

  if (task.lifecycle_status && task.lifecycle_status !== "open") {
    return {
      allowed: false,
      reason: "task_not_open",
      message: "المهمة ليست مفتوحة للإلغاء.",
      statusCode: 409,
    };
  }

  // المهام الشخصية لا يلغيها إلا صاحبها
  if (task.target_type === "self" && task.created_by !== actor.id) {
    return {
      allowed: false,
      reason: "personal_task",
      message: "لا يمكن إلغاء مهمة شخصية خاصة بعضو آخر.",
      statusCode: 403,
    };
  }

  // منشئ المهمة
  if (task.created_by === actor.id) {
    return { allowed: true };
  }

  // الإدارة العليا والموارد البشرية
  if (
    actor.role === "ADMIN" ||
    actor.role === "SUPER_ADMIN" ||
    actor.role === "HR"
  ) {
    return { allowed: true };
  }

  // رئيس القسم لمهام قسمه فقط
  if (actor.role === "DEPARTMENT_HEAD") {
    if (
      actor.departmentId !== null &&
      actor.departmentId !== undefined &&
      actor.departmentId === task.department_id
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "department_mismatch",
      message: "رئيس القسم يمكنه إلغاء مهام قسمه فقط.",
      statusCode: 403,
    };
  }

  return {
    allowed: false,
    reason: "role_not_allowed",
    message: "غير مصرح لك بإلغاء هذه المهمة.",
    statusCode: 403,
  };
}
