import type { UserRole } from "./roles";

export const MEMBER_READ_ROLES: UserRole[] = ["HR", "ADMIN", "SUPER_ADMIN"];
export const MEMBER_MANAGE_ROLES: UserRole[] = ["HR", "ADMIN", "SUPER_ADMIN"];
export const ROLE_CHANGE_ROLES: UserRole[] = ["ADMIN", "SUPER_ADMIN"];

export function canReadMembers(role: UserRole | null | undefined): boolean {
  return role ? MEMBER_READ_ROLES.includes(role) : false;
}

export function canManageMembers(role: UserRole | null | undefined): boolean {
  return role ? MEMBER_MANAGE_ROLES.includes(role) : false;
}

export function canChangeMemberStatus(
  role: UserRole | null | undefined
): boolean {
  return role ? MEMBER_MANAGE_ROLES.includes(role) : false;
}

export function canChangeMemberRole(
  role: UserRole | null | undefined
): boolean {
  return role ? ROLE_CHANGE_ROLES.includes(role) : false;
}

export function isSelf(
  requesterId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  if (!requesterId || !targetId) return false;
  return requesterId === targetId;
}

/**
 * هل العضو في حالة تسمح بالوصول إلى العمليات الحساسة؟
 * تُستخدم خادميًا لفرض حالة العضوية بغض النظر عن الواجهة.
 */
export function isActiveMember(status: unknown): boolean {
  return String(status ?? "").toLowerCase() === "active";
}

/**
 * من يحق له إسناد دور معيّن إلى عضو.
 * - SUPER_ADMIN: كل الأدوار.
 * - ADMIN: كل الأدوار ما عدا SUPER_ADMIN.
 * - HR: المتطوعون ورؤساء الأقسام فقط.
 * - غير ذلك: لا شيء.
 */
export function canAssignRole(
  requesterRole: UserRole | null | undefined,
  targetRole: UserRole | null | undefined
): boolean {
  if (!requesterRole || !targetRole) return false;
  if (requesterRole === "SUPER_ADMIN") return true;
  if (requesterRole === "ADMIN") return targetRole !== "SUPER_ADMIN";
  if (requesterRole === "HR") {
    return targetRole === "VOLUNTEER" || targetRole === "DEPARTMENT_HEAD";
  }
  return false;
}

/**
 * هل يجوز للطالب تعديل هذا العضو (دوره/حالته) بناءً على دوره الحالي.
 * حماية الحسابات الحساسة:
 * - SUPER_ADMIN: يعدّل أي عضو.
 * - ADMIN: يعدّل الجميع ما عدا SUPER_ADMIN.
 * - HR: يعدّل المتطوعين ورؤساء الأقسام فقط، ولا يمسّ الإداريين.
 * - غير ذلك: لا شيء.
 */
export function canModifyMember(
  requesterRole: UserRole | null | undefined,
  targetRole: UserRole | null | undefined
): boolean {
  if (!requesterRole || !targetRole) return false;
  if (requesterRole === "SUPER_ADMIN") return true;
  if (requesterRole === "ADMIN") return targetRole !== "SUPER_ADMIN";
  if (requesterRole === "HR") {
    return targetRole === "VOLUNTEER" || targetRole === "DEPARTMENT_HEAD";
  }
  return false;
}

export function canReadUser(
  requesterRole: UserRole | null | undefined,
  requesterId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  if (!requesterId || !targetId) return false;
  if (requesterId === targetId) return true;
  return canReadMembers(requesterRole);
}

export type ProfileState = {
  profile_completed?: boolean | null;
};

/**
 * العضو يكمل ملفه إن لم يكن قد أكمل بعد.
 * الأعضاء الحاليون (بدون عمود profile_completed) يُعتبرون مكتملين.
 */
export function isProfileComplete(
  user: ProfileState | null | undefined
): boolean {
  if (!user) return false;
  return user.profile_completed !== false;
}

export const ALLOWED_MEMBER_ROLES: UserRole[] = [
  "VOLUNTEER",
  "DEPARTMENT_HEAD",
  "HR",
  "ADMIN",
  "SUPER_ADMIN",
];

export const ALLOWED_MEMBER_STATUSES = [
  "pending",
  "active",
  "inactive",
  "suspended",
  "ended",
];

export function isValidMemberRole(value: unknown): value is UserRole {
  return ALLOWED_MEMBER_ROLES.includes(String(value) as UserRole);
}

export type MemberEditableField = "role" | "status";

export type MemberUpdateReason =
  | "self"
  | "field_permission"
  | "target_protected"
  | "invalid_role"
  | "invalid_status"
  | "cannot_assign";

export type MemberUpdateDecision =
  | { allowed: true }
  | { allowed: false; reason: MemberUpdateReason; message: string };

/**
 * قرار موحّد (نقي وقابل للاختبار) لتعديل دور/حالة عضو.
 * يطبّقه PATCH /api/users/[id] حرفيًا.
 */
export function decideMemberUpdate(input: {
  requesterRole: UserRole | null | undefined;
  requesterId: string | null | undefined;
  targetId: string;
  targetRole: UserRole | null | undefined;
  field: MemberEditableField;
  newValue: string;
}): MemberUpdateDecision {
  const { requesterRole, requesterId, targetId, targetRole, field, newValue } =
    input;

  if (isSelf(requesterId, targetId)) {
    return {
      allowed: false,
      reason: "self",
      message: "لا يمكنك تعديل دورك أو حالتك بنفسك.",
    };
  }

  if (field === "role" && !canChangeMemberRole(requesterRole)) {
    return {
      allowed: false,
      reason: "field_permission",
      message: "تغيير الأدوار محصور بالإدارة العليا والرئيس العام.",
    };
  }

  if (field === "status" && !canChangeMemberStatus(requesterRole)) {
    return {
      allowed: false,
      reason: "field_permission",
      message: "تغيير حالة الأعضاء غير مسموح لرتبتك.",
    };
  }

  if (!canModifyMember(requesterRole, targetRole)) {
    return {
      allowed: false,
      reason: "target_protected",
      message: "لا تملك صلاحية تعديل هذا الحساب.",
    };
  }

  if (field === "role") {
    if (!isValidMemberRole(newValue)) {
      return { allowed: false, reason: "invalid_role", message: "الدور غير صالح." };
    }
    if (!canAssignRole(requesterRole, newValue)) {
      return {
        allowed: false,
        reason: "cannot_assign",
        message: "لا يمكنك إسناد هذا الدور.",
      };
    }
  }

  if (field === "status") {
    if (!ALLOWED_MEMBER_STATUSES.includes(newValue)) {
      return {
        allowed: false,
        reason: "invalid_status",
        message: "الحالة غير صالحة.",
      };
    }
  }

  return { allowed: true };
}

