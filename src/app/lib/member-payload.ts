import type { UserRole } from "./roles.ts";

export const DEFAULT_MEMBER_ROLE: UserRole = "VOLUNTEER";
export const DEFAULT_MEMBER_STATUS = "active";

export type BuildMemberPayloadInput = {
  departmentId?: string | null;
  [key: string]: unknown;
};

export type MemberPayloadMeta = {
  linkCodeHash: string;
  expiresAt: string;
  joinedAt?: string;
};

export type MemberInsertPayload = {
  first_name: string;
  father_name: null;
  last_name: null;
  email: null;
  phone: null;
  country_code: null;
  nationality: null;
  residence: null;
  birth_date: null;
  department_id: string | null;
  role: UserRole;
  status: string;
  profile_completed: false;
  joined_at: string;
  link_code: string;
  link_code_expires_at: string;
};

/**
 * دالة نقية تبني كائن إدخال العضو الجديد (insert payload).
 * تتجاهل أي بيانات شخصية أو رتبة أو حالة مرسلة، وتلزم بقيم الخادم:
 * - role: VOLUNTEER
 * - status: active
 * - profile_completed: false
 * - first_name: نص فارغ
 * - باقي البيانات الشخصية: null
 * - department_id: الحقل الوحيد المقبول (اختياري)
 */
export function buildMemberInsertPayload(
  input: BuildMemberPayloadInput,
  meta: MemberPayloadMeta
): MemberInsertPayload {
  const departmentId =
    typeof input.departmentId === "string" && input.departmentId.trim()
      ? input.departmentId.trim()
      : null;

  return {
    first_name: "",
    father_name: null,
    last_name: null,
    email: null,
    phone: null,
    country_code: null,
    nationality: null,
    residence: null,
    birth_date: null,
    department_id: departmentId,
    role: DEFAULT_MEMBER_ROLE,
    status: DEFAULT_MEMBER_STATUS,
    profile_completed: false,
    joined_at: meta.joinedAt ?? new Date().toISOString(),
    link_code: meta.linkCodeHash,
    link_code_expires_at: meta.expiresAt,
  };
}
