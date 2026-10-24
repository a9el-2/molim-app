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
