import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMemberCreateAuditPayload,
  buildMemberRoleAuditPayload,
  buildMemberStatusAuditPayload,
  buildMemberUpdateAuditPayload,
  buildMemberAuditPayload,
} from "../src/app/lib/members-payload.ts";

test("سجل تدقيق إنشاء عضو (create_member): الفئة والإجراء والهدف صحيحة و before_data خالية", () => {
  const payload = buildMemberCreateAuditPayload({
    actorId: "MOL-ADMIN-1",
    memberId: "MOL-00050",
    departmentId: "dept-media",
    role: "VOLUNTEER",
    status: "active",
    profileCompleted: false,
  });

  assert.equal(payload.category, "volunteers");
  assert.equal(payload.action, "create_member");
  assert.equal(payload.actor_id, "MOL-ADMIN-1");
  assert.equal(payload.target_type, "users");
  assert.equal(payload.target_id, "MOL-00050");
  assert.equal(payload.target_user_id, "MOL-00050");
  assert.equal(payload.department_id, "dept-media");
  assert.equal(payload.before_data, null);
});

test("سجل تدقيق إنشاء عضو: after_data تحتوي فقط على id, role, status, department_id, profile_completed وممنوع احتوائها على أي بيانات حساسة", () => {
  const sensitiveRawData: Record<string, unknown> = {
    id: "MOL-00099",
    role: "VOLUNTEER",
    status: "active",
    department_id: "dept-tech",
    profile_completed: false,
    // بيانات حساسة ومحظورة
    link_code: "MOL-ABCD-EFGH",
    link_code_hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    link_code_expires_at: "2026-10-19T14:00:00.000Z",
    password_hash: "super_secret_argon2",
    token: "session_token_xyz",
    // بيانات شخصية محظورة
    first_name: "خالد",
    father_name: "عبدالله",
    last_name: "السعد",
    email: "khaled@example.com",
    phone: "0555555555",
    country_code: "SA",
    nationality: "سعودي",
    residence: "الرياض",
    birth_date: "1995-05-15",
  };

  const payload = buildMemberCreateAuditPayload({
    actorId: "MOL-HR-1",
    memberId: "MOL-00099",
    rawMemberData: sensitiveRawData,
  });

  const keys = Object.keys(payload.after_data).sort();
  assert.deepEqual(keys, [
    "department_id",
    "id",
    "profile_completed",
    "role",
    "status",
  ]);

  assert.equal(payload.after_data.id, "MOL-00099");
  assert.equal(payload.after_data.role, "VOLUNTEER");
  assert.equal(payload.after_data.status, "active");
  assert.equal(payload.after_data.department_id, "dept-tech");
  assert.equal(payload.after_data.profile_completed, false);

  // التأكد من خلو after_data الصارم من كافة الحقول الحساسة
  assert.equal("link_code" in payload.after_data, false);
  assert.equal("link_code_hash" in payload.after_data, false);
  assert.equal("link_code_expires_at" in payload.after_data, false);
  assert.equal("password_hash" in payload.after_data, false);
  assert.equal("token" in payload.after_data, false);
  assert.equal("first_name" in payload.after_data, false);
  assert.equal("father_name" in payload.after_data, false);
  assert.equal("last_name" in payload.after_data, false);
  assert.equal("email" in payload.after_data, false);
  assert.equal("phone" in payload.after_data, false);
  assert.equal("country_code" in payload.after_data, false);
  assert.equal("nationality" in payload.after_data, false);
  assert.equal("residence" in payload.after_data, false);
  assert.equal("birth_date" in payload.after_data, false);
});

test("سجل تدقيق تغيير الرتبة (change_role): الفئة roles والإجراء change_role وحصر before_data و after_data في role و id فقط", () => {
  const payload = buildMemberRoleAuditPayload({
    actorId: "MOL-SUPER-1",
    memberId: "MOL-00010",
    departmentId: "dept-admin",
    oldRole: "VOLUNTEER",
    newRole: "DEPARTMENT_HEAD",
  });

  assert.equal(payload.category, "roles");
  assert.equal(payload.action, "change_role");
  assert.equal(payload.actor_id, "MOL-SUPER-1");
  assert.equal(payload.target_type, "users");
  assert.equal(payload.target_id, "MOL-00010");
  assert.equal(payload.target_user_id, "MOL-00010");
  assert.equal(payload.department_id, "dept-admin");

  // before_data و after_data تحتويان فقط role و id
  assert.deepEqual(payload.before_data, {
    id: "MOL-00010",
    role: "VOLUNTEER",
  });
  assert.deepEqual(payload.after_data, {
    id: "MOL-00010",
    role: "DEPARTMENT_HEAD",
  });

  assert.deepEqual(Object.keys(payload.before_data ?? {}).sort(), ["id", "role"]);
  assert.deepEqual(Object.keys(payload.after_data).sort(), ["id", "role"]);
});

test("سجل تدقيق تغيير الحالة (update_volunteer): الفئة volunteers والإجراء update_volunteer وحصر before_data و after_data في status و id فقط", () => {
  const payload = buildMemberStatusAuditPayload({
    actorId: "MOL-HR-1",
    memberId: "MOL-00020",
    departmentId: "dept-design",
    oldStatus: "active",
    newStatus: "suspended",
  });

  assert.equal(payload.category, "volunteers");
  assert.equal(payload.action, "update_volunteer");
  assert.equal(payload.actor_id, "MOL-HR-1");
  assert.equal(payload.target_type, "users");
  assert.equal(payload.target_id, "MOL-00020");
  assert.equal(payload.target_user_id, "MOL-00020");
  assert.equal(payload.department_id, "dept-design");

  // before_data و after_data تحتويان فقط status و id
  assert.deepEqual(payload.before_data, {
    id: "MOL-00020",
    status: "active",
  });
  assert.deepEqual(payload.after_data, {
    id: "MOL-00020",
    status: "suspended",
  });

  assert.deepEqual(Object.keys(payload.before_data ?? {}).sort(), ["id", "status"]);
  assert.deepEqual(Object.keys(payload.after_data).sort(), ["id", "status"]);
});

test("دالة التعديل العامة (buildMemberUpdateAuditPayload): تفوض بشكل دقيق حسب نوع الحقل role أو status", () => {
  const roleAudit = buildMemberUpdateAuditPayload({
    actorId: "MOL-ADMIN-1",
    memberId: "MOL-00030",
    departmentId: null,
    field: "role",
    oldValue: "VOLUNTEER",
    newValue: "HR",
  });
  assert.equal(roleAudit.action, "change_role");
  assert.equal(roleAudit.category, "roles");
  assert.deepEqual(roleAudit.after_data, { id: "MOL-00030", role: "HR" });

  const statusAudit = buildMemberUpdateAuditPayload({
    actorId: "MOL-ADMIN-1",
    memberId: "MOL-00030",
    departmentId: null,
    field: "status",
    oldValue: "suspended",
    newValue: "active",
  });
  assert.equal(statusAudit.action, "update_volunteer");
  assert.equal(statusAudit.category, "volunteers");
  assert.deepEqual(statusAudit.after_data, { id: "MOL-00030", status: "active" });
});

test("دالة التدقيق الشاملة (buildMemberAuditPayload): تدعم كافة العمليات بدقة", () => {
  const createRes = buildMemberAuditPayload({
    action: "create_member",
    actorId: "admin",
    memberId: "user-1",
    departmentId: "dept-1",
    role: "VOLUNTEER",
    status: "active",
  });
  assert.equal(createRes.action, "create_member");
  assert.equal(createRes.category, "volunteers");

  const roleRes = buildMemberAuditPayload({
    action: "change_role",
    actorId: "admin",
    memberId: "user-1",
    oldRole: "VOLUNTEER",
    newRole: "ADMIN",
  });
  assert.equal(roleRes.action, "change_role");
  assert.equal(roleRes.category, "roles");

  const statusRes = buildMemberAuditPayload({
    action: "update_volunteer",
    actorId: "admin",
    memberId: "user-1",
    oldStatus: "active",
    newStatus: "inactive",
  });
  assert.equal(statusRes.action, "update_volunteer");
  assert.equal(statusRes.category, "volunteers");
});
