/**
 * دوال نقية لبناء حمولات سجل التدقيق audit_logs الخاصة بالأعضاء (إضافة وتعديل رتبة/حالة).
 * تضمن عدم تسريب أي بيانات حساسة (مثل كود الربط أو هاشه أو تاريخ انتهائه أو البيانات الشخصية)،
 * وتطبيق قيم الخادم والتعدادات الدقيقة الموجودة في قاعدة البيانات حصراً.
 */

export type MemberAuditAction =
  | "create_member"
  | "change_role"
  | "update_volunteer";

export type MemberAuditCategory = "volunteers" | "roles";

export type MemberCreateAfterData = {
  id: string;
  role: string;
  status: string;
  department_id: string | null;
  profile_completed: boolean;
};

export type MemberRoleAuditData = {
  id: string;
  role: string;
};

export type MemberStatusAuditData = {
  id: string;
  status: string;
};

export type MemberAuditLogInsertPayload = {
  actor_id: string;
  category: MemberAuditCategory;
  action: MemberAuditAction;
  target_type: "users";
  target_id: string;
  target_user_id: string;
  department_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  details: string | null;
};

export type BuildMemberCreateAuditInput = {
  actorId: string;
  memberId: string;
  departmentId?: string | null;
  role?: string;
  status?: string;
  profileCompleted?: boolean;
  rawMemberData?: Record<string, unknown>;
  details?: string | null;
};

/**
 * بناء حمولة سجل التدقيق لإضافة عضو جديد (action=create_member, category=volunteers).
 * after_data تحتوي فقط: id, role, status, department_id, profile_completed.
 * يُمنع منعاً باتاً تضمين أي كود ربط أو هاش أو تاريخ انتهاء أو بيانات شخصية.
 */
export function buildMemberCreateAuditPayload(
  input: BuildMemberCreateAuditInput
): MemberAuditLogInsertPayload {
  const memberId = String(input.memberId || input.rawMemberData?.id || "");
  const role = String(input.role || input.rawMemberData?.role || "VOLUNTEER");
  const status = String(input.status || input.rawMemberData?.status || "active");
  const departmentId =
    input.departmentId !== undefined
      ? input.departmentId
      : (input.rawMemberData?.department_id as string | null | undefined) ?? null;
  const profileCompleted = Boolean(
    input.profileCompleted !== undefined
      ? input.profileCompleted
      : input.rawMemberData?.profile_completed ?? false
  );

  const cleanAfterData: MemberCreateAfterData = {
    id: memberId,
    role,
    status,
    department_id: departmentId,
    profile_completed: profileCompleted,
  };

  return {
    actor_id: input.actorId,
    category: "volunteers",
    action: "create_member",
    target_type: "users",
    target_id: memberId,
    target_user_id: memberId,
    department_id: departmentId,
    before_data: null,
    after_data: cleanAfterData,
    details: input.details ?? "إنشاء عضو جديد في المنصة",
  };
}

export type BuildMemberRoleAuditInput = {
  actorId: string;
  memberId: string;
  departmentId?: string | null;
  oldRole: string;
  newRole: string;
  details?: string | null;
};

/**
 * بناء حمولة سجل التدقيق لتغيير رتبة عضو (action=change_role, category=roles).
 * before_data و after_data تحتويان فقط الحقل المتغيّر (role) ومعرّف العضو.
 */
export function buildMemberRoleAuditPayload(
  input: BuildMemberRoleAuditInput
): MemberAuditLogInsertPayload {
  const memberId = String(input.memberId);
  const beforeData: MemberRoleAuditData = {
    id: memberId,
    role: input.oldRole,
  };
  const afterData: MemberRoleAuditData = {
    id: memberId,
    role: input.newRole,
  };

  return {
    actor_id: input.actorId,
    category: "roles",
    action: "change_role",
    target_type: "users",
    target_id: memberId,
    target_user_id: memberId,
    department_id: input.departmentId ?? null,
    before_data: beforeData,
    after_data: afterData,
    details:
      input.details ??
      `تغيير دور العضو من ${input.oldRole} إلى ${input.newRole}`,
  };
}

export type BuildMemberStatusAuditInput = {
  actorId: string;
  memberId: string;
  departmentId?: string | null;
  oldStatus: string;
  newStatus: string;
  details?: string | null;
};

/**
 * بناء حمولة سجل التدقيق لتغيير حالة عضو (action=update_volunteer, category=volunteers).
 * before_data و after_data تحتويان فقط الحقل المتغيّر (status) ومعرّف العضو.
 */
export function buildMemberStatusAuditPayload(
  input: BuildMemberStatusAuditInput
): MemberAuditLogInsertPayload {
  const memberId = String(input.memberId);
  const beforeData: MemberStatusAuditData = {
    id: memberId,
    status: input.oldStatus,
  };
  const afterData: MemberStatusAuditData = {
    id: memberId,
    status: input.newStatus,
  };

  return {
    actor_id: input.actorId,
    category: "volunteers",
    action: "update_volunteer",
    target_type: "users",
    target_id: memberId,
    target_user_id: memberId,
    department_id: input.departmentId ?? null,
    before_data: beforeData,
    after_data: afterData,
    details:
      input.details ??
      `تغيير حالة العضو من ${input.oldStatus} إلى ${input.newStatus}`,
  };
}

export type BuildMemberUpdateAuditInput = {
  actorId: string;
  memberId: string;
  departmentId?: string | null;
  field: "role" | "status";
  oldValue: string;
  newValue: string;
  details?: string | null;
};

/**
 * بناء حمولة التدقيق لتعديل حقل دور أو حالة عضو بحسب نوع الحقل.
 */
export function buildMemberUpdateAuditPayload(
  input: BuildMemberUpdateAuditInput
): MemberAuditLogInsertPayload {
  if (input.field === "role") {
    return buildMemberRoleAuditPayload({
      actorId: input.actorId,
      memberId: input.memberId,
      departmentId: input.departmentId,
      oldRole: input.oldValue,
      newRole: input.newValue,
      details: input.details,
    });
  }

  return buildMemberStatusAuditPayload({
    actorId: input.actorId,
    memberId: input.memberId,
    departmentId: input.departmentId,
    oldStatus: input.oldValue,
    newStatus: input.newValue,
    details: input.details,
  });
}

export type BuildMemberAuditInput =
  | ({ action: "create_member" } & BuildMemberCreateAuditInput)
  | ({ action: "change_role" } & BuildMemberRoleAuditInput)
  | ({ action: "update_volunteer" } & BuildMemberStatusAuditInput);

/**
 * دالة شاملة نقية لبناء حمولة التدقيق الخاصة بالأعضاء.
 */
export function buildMemberAuditPayload(
  input: BuildMemberAuditInput
): MemberAuditLogInsertPayload {
  switch (input.action) {
    case "create_member":
      return buildMemberCreateAuditPayload(input);
    case "change_role":
      return buildMemberRoleAuditPayload(input);
    case "update_volunteer":
      return buildMemberStatusAuditPayload(input);
  }
}
