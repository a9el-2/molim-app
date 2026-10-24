/**
 * دوال نقية بلا قاعدة بيانات لسياسات تكليفات المهام:
 * - validateNewTaskFields: التحقق من حقول إنشاء المهمة الجديدة.
 * - mapClaimError: تحويل رسالة خطأ claim_task إلى استجابة HTTP.
 * - canViewTaskAssignments: هل يحق للمشاهد رؤية تكليفات مستخدم آخر.
 */

import { isValidISODate } from "./hours-policy.ts";
import type { UserRole } from "./roles.ts";

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
        message: "تاريخ الاستحقاق غير صالح (يجب أن يكون بصيغة YYYY-MM-DD وتاريخاً تقويمياً صحيحاً).",
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
