import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canReadMembers,
  canManageMembers,
  canChangeMemberStatus,
  canChangeMemberRole,
  canAssignRole,
  canModifyMember,
  decideMemberUpdate,
  canReadUser,
  isSelf,
  isActiveMember,
  isProfileComplete,
} from "../src/app/lib/access-control.ts";

test("قراءة قائمة الأعضاء: الإدارة والموارد البشرية فقط", () => {
  assert.equal(canReadMembers("SUPER_ADMIN"), true);
  assert.equal(canReadMembers("ADMIN"), true);
  assert.equal(canReadMembers("HR"), true);
  assert.equal(canReadMembers("DEPARTMENT_HEAD"), false);
  assert.equal(canReadMembers("VOLUNTEER"), false);
  assert.equal(canReadMembers(null), false);
  assert.equal(canReadMembers(undefined), false);
});

test("إدارة الأعضاء: الإدارة والموارد البشرية فقط", () => {
  assert.equal(canManageMembers("SUPER_ADMIN"), true);
  assert.equal(canManageMembers("ADMIN"), true);
  assert.equal(canManageMembers("HR"), true);
  assert.equal(canManageMembers("DEPARTMENT_HEAD"), false);
  assert.equal(canManageMembers("VOLUNTEER"), false);
});

test("تغيير الحالة: الإدارة والموارد البشرية فقط", () => {
  assert.equal(canChangeMemberStatus("HR"), true);
  assert.equal(canChangeMemberStatus("ADMIN"), true);
  assert.equal(canChangeMemberStatus("SUPER_ADMIN"), true);
  assert.equal(canChangeMemberStatus("DEPARTMENT_HEAD"), false);
  assert.equal(canChangeMemberStatus("VOLUNTEER"), false);
});

test("تغيير الدور: الإدارة العليا والرئيس العام فقط", () => {
  assert.equal(canChangeMemberRole("ADMIN"), true);
  assert.equal(canChangeMemberRole("SUPER_ADMIN"), true);
  assert.equal(canChangeMemberRole("HR"), false);
  assert.equal(canChangeMemberRole("DEPARTMENT_HEAD"), false);
  assert.equal(canChangeMemberRole("VOLUNTEER"), false);
});

test("إسناد الأدوار: الموارد البشرية لا تستطيع ترقية نفسها أو غيرها إدارياً", () => {
  assert.equal(canAssignRole("HR", "VOLUNTEER"), true);
  assert.equal(canAssignRole("HR", "DEPARTMENT_HEAD"), true);
  assert.equal(canAssignRole("HR", "HR"), false);
  assert.equal(canAssignRole("HR", "ADMIN"), false);
  assert.equal(canAssignRole("HR", "SUPER_ADMIN"), false);
});

test("إسناد الأدوار: الإدارة العليا لا تستطيع إسناد الرئيس العام", () => {
  assert.equal(canAssignRole("ADMIN", "VOLUNTEER"), true);
  assert.equal(canAssignRole("ADMIN", "HR"), true);
  assert.equal(canAssignRole("ADMIN", "ADMIN"), true);
  assert.equal(canAssignRole("ADMIN", "SUPER_ADMIN"), false);
});

test("إسناد الأدوار: الرئيس العام يستطيع إسناد كل الأدوار", () => {
  assert.equal(canAssignRole("SUPER_ADMIN", "VOLUNTEER"), true);
  assert.equal(canAssignRole("SUPER_ADMIN", "DEPARTMENT_HEAD"), true);
  assert.equal(canAssignRole("SUPER_ADMIN", "HR"), true);
  assert.equal(canAssignRole("SUPER_ADMIN", "ADMIN"), true);
  assert.equal(canAssignRole("SUPER_ADMIN", "SUPER_ADMIN"), true);
});

test("إسناد الأدوار: المتطوع ورئيس القسم لا يستطيعان الإسناد", () => {
  assert.equal(canAssignRole("VOLUNTEER", "VOLUNTEER"), false);
  assert.equal(canAssignRole("DEPARTMENT_HEAD", "VOLUNTEER"), false);
  assert.equal(canAssignRole(null, "VOLUNTEER"), false);
  assert.equal(canAssignRole("HR", null), false);
});

test("الذات: منع تعديل العضو لدوره أو حالته بنفسه", () => {
  assert.equal(isSelf("MOL-00001", "MOL-00001"), true);
  assert.equal(isSelf("MOL-00001", "MOL-00002"), false);
  assert.equal(isSelf(null, "MOL-00001"), false);
  assert.equal(isSelf("MOL-00001", null), false);
});

test("حماية الحسابات الحساسة: ADMIN لا يمسّ SUPER_ADMIN", () => {
  assert.equal(canModifyMember("SUPER_ADMIN", "SUPER_ADMIN"), true);
  assert.equal(canModifyMember("SUPER_ADMIN", "ADMIN"), true);
  assert.equal(canModifyMember("SUPER_ADMIN", "VOLUNTEER"), true);
  assert.equal(canModifyMember("ADMIN", "ADMIN"), true);
  assert.equal(canModifyMember("ADMIN", "HR"), true);
  assert.equal(canModifyMember("ADMIN", "VOLUNTEER"), true);
  assert.equal(canModifyMember("ADMIN", "SUPER_ADMIN"), false);
});

test("حماية الحسابات الحساسة: HR لا يمسّ الإداريين ولا رؤساء الموارد البشرية", () => {
  assert.equal(canModifyMember("HR", "VOLUNTEER"), true);
  assert.equal(canModifyMember("HR", "DEPARTMENT_HEAD"), true);
  assert.equal(canModifyMember("HR", "HR"), false);
  assert.equal(canModifyMember("HR", "ADMIN"), false);
  assert.equal(canModifyMember("HR", "SUPER_ADMIN"), false);
});

test("حماية الحسابات الحساسة: غير الإداريين لا يعدّلون أحدًا", () => {
  assert.equal(canModifyMember("VOLUNTEER", "VOLUNTEER"), false);
  assert.equal(canModifyMember("DEPARTMENT_HEAD", "VOLUNTEER"), false);
  assert.equal(canModifyMember(null, "VOLUNTEER"), false);
  assert.equal(canModifyMember("HR", null), false);
});

const baseUpdate = {
  requesterRole: "ADMIN" as const,
  requesterId: "MOL-00003",
  targetId: "MOL-00005",
  targetRole: "VOLUNTEER" as UserRole,
  field: "role" as const,
  newValue: "DEPARTMENT_HEAD",
};

test("قرار التعديل: ADMIN لا يعدّل SUPER_ADMIN (target_protected)", () => {
  const decision = decideMemberUpdate({
    ...baseUpdate,
    targetRole: "SUPER_ADMIN",
    field: "status",
    newValue: "suspended",
  });
  assert.deepEqual(decision, {
    allowed: false,
    reason: "target_protected",
    message: "لا تملك صلاحية تعديل هذا الحساب.",
  });
});

test("قرار التعديل: ADMIN لا يرقّي أحدًا إلى SUPER_ADMIN (cannot_assign)", () => {
  const decision = decideMemberUpdate({
    ...baseUpdate,
    newValue: "SUPER_ADMIN",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "cannot_assign");
});

test("قرار التعديل: لا يمكن تعديل النفس (role و status)", () => {
  const roleDecision = decideMemberUpdate({
    requesterRole: "SUPER_ADMIN",
    requesterId: "MOL-00001",
    targetId: "MOL-00001",
    targetRole: "SUPER_ADMIN",
    field: "role",
    newValue: "ADMIN",
  });
  assert.equal(roleDecision.allowed, false);
  assert.equal(roleDecision.allowed === false && roleDecision.reason, "self");

  const statusDecision = decideMemberUpdate({
    requesterRole: "ADMIN",
    requesterId: "MOL-00003",
    targetId: "MOL-00003",
    targetRole: "ADMIN",
    field: "status",
    newValue: "inactive",
  });
  assert.equal(statusDecision.allowed, false);
  assert.equal(statusDecision.allowed === false && statusDecision.reason, "self");
});

test("قرار التعديل: HR لا يعدّل HR/ADMIN/SUPER_ADMIN", () => {
  for (const targetRole of ["HR", "ADMIN", "SUPER_ADMIN"] as UserRole[]) {
    const decision = decideMemberUpdate({
      requesterRole: "HR",
      requesterId: "MOL-00008",
      targetId: "MOL-00010",
      targetRole,
      field: "status",
      newValue: "suspended",
    });
    assert.equal(decision.allowed, false, `HR عدّل ${targetRole}`);
    assert.equal(
      decision.allowed === false && decision.reason,
      "target_protected"
    );
  }
});

test("قرار التعديل: HR لا يستطيع تغيير الأدوار إطلاقًا", () => {
  for (const newValue of ["HR", "ADMIN", "SUPER_ADMIN"] as UserRole[]) {
    const decision = decideMemberUpdate({
      requesterRole: "HR",
      requesterId: "MOL-00008",
      targetId: "MOL-00005",
      targetRole: "VOLUNTEER",
      field: "role",
      newValue,
    });
    assert.equal(decision.allowed, false, `HR أسند ${newValue}`);
    assert.equal(
      decision.allowed === false && decision.reason,
      "field_permission"
    );
  }
});

test("قرار التعديل: غير الإداريين لا يملكون صلاحية الحقل", () => {
  const decision = decideMemberUpdate({
    requesterRole: "VOLUNTEER",
    requesterId: "MOL-00015",
    targetId: "MOL-00005",
    targetRole: "VOLUNTEER",
    field: "role",
    newValue: "VOLUNTEER",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "field_permission");
});

test("قرار التعديل: أدوار/حالات غير صالحة ترجع 400 (invalid_*)", () => {
  const badRole = decideMemberUpdate({ ...baseUpdate, newValue: "WIZARD" });
  assert.equal(badRole.allowed === false && badRole.reason, "invalid_role");

  const badStatus = decideMemberUpdate({
    ...baseUpdate,
    requesterRole: "ADMIN",
    field: "status",
    newValue: "sleeping",
  });
  assert.equal(badStatus.allowed === false && badStatus.reason, "invalid_status");
});

test("قرار التعديل: الحالات المسموحة تنجح", () => {
  assert.equal(
    decideMemberUpdate({ ...baseUpdate, newValue: "ADMIN" }).allowed,
    true
  );
  assert.equal(
    decideMemberUpdate({
      requesterRole: "SUPER_ADMIN",
      requesterId: "MOL-00001",
      targetId: "MOL-00005",
      targetRole: "VOLUNTEER",
      field: "role",
      newValue: "SUPER_ADMIN",
    }).allowed,
    true
  );
  assert.equal(
    decideMemberUpdate({
      requesterRole: "HR",
      requesterId: "MOL-00008",
      targetId: "MOL-00005",
      targetRole: "DEPARTMENT_HEAD",
      field: "status",
      newValue: "active",
    }).allowed,
    true
  );
});

test("قراءة مستخدم: العضو يقرأ نفسه، والمدير يقرأ الآخرين", () => {
  assert.equal(canReadUser("VOLUNTEER", "MOL-00005", "MOL-00005"), true);
  assert.equal(canReadUser("VOLUNTEER", "MOL-00005", "MOL-00006"), false);
  assert.equal(canReadUser("HR", "MOL-00008", "MOL-00005"), true);
  assert.equal(canReadUser("ADMIN", "MOL-00003", "MOL-00005"), true);
  assert.equal(canReadUser("DEPARTMENT_HEAD", "MOL-00010", "MOL-00005"), false);
});

test("حالة إكمال الملف: الأعضاء الحاليون (بلا عمود) يُعتبرون مكتملين", () => {
  assert.equal(isProfileComplete({}), true);
  assert.equal(isProfileComplete({ profile_completed: true }), true);
  assert.equal(isProfileComplete({ profile_completed: false }), false);
  assert.equal(isProfileComplete({ profile_completed: null }), true);
  assert.equal(isProfileComplete(null), false);
  assert.equal(isProfileComplete(undefined), false);
});

test("فرض حالة العضو: النشط فقط مسموح", () => {
  assert.equal(isActiveMember("active"), true);
  assert.equal(isActiveMember("ACTIVE"), true);
  assert.equal(isActiveMember("pending"), false);
  assert.equal(isActiveMember("inactive"), false);
  assert.equal(isActiveMember("suspended"), false);
  assert.equal(isActiveMember("ended"), false);
  assert.equal(isActiveMember(""), false);
  assert.equal(isActiveMember(null), false);
  assert.equal(isActiveMember(undefined), false);
});
