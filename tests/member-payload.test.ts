import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMemberInsertPayload,
  DEFAULT_MEMBER_ROLE,
  DEFAULT_MEMBER_STATUS,
} from "../src/app/lib/member-payload.ts";

test("تجاهل الدور والحالة والبيانات الشخصية: طلب فيه role=ADMIN و status=suspended و first_name ينتج عضواً برتبة VOLUNTEER وحالة active وبدون بيانات شخصية", () => {
  const fakeMeta = {
    linkCodeHash: "hash_abcdef123456",
    expiresAt: "2026-10-15T00:00:00.000Z",
    joinedAt: "2026-10-13T12:00:00.000Z",
  };

  const maliciousOrOutdatedInput = {
    first_name: "أحمد",
    father_name: "محمد",
    last_name: "علي",
    email: "admin@example.org",
    phone: "0501234567",
    country_code: "+966",
    nationality: "سعودي",
    residence: "الرياض",
    birth_date: "1995-01-01",
    role: "ADMIN",
    status: "suspended",
    telegramId: 999999,
    telegramUsername: "admin_hacker",
  };

  const payload = buildMemberInsertPayload(maliciousOrOutdatedInput, fakeMeta);

  // الرتبة دائماً VOLUNTEER والحالة active
  assert.equal(payload.role, DEFAULT_MEMBER_ROLE);
  assert.equal(payload.role, "VOLUNTEER");
  assert.equal(payload.status, DEFAULT_MEMBER_STATUS);
  assert.equal(payload.status, "active");

  // الملف الشخصي غير مكتمل بعد
  assert.equal(payload.profile_completed, false);

  // تفريغ البيانات الشخصية وعدم قبول أي قيمة
  assert.equal(payload.first_name, "");
  assert.equal(payload.father_name, null);
  assert.equal(payload.last_name, null);
  assert.equal(payload.email, null);
  assert.equal(payload.phone, null);
  assert.equal(payload.country_code, null);
  assert.equal(payload.nationality, null);
  assert.equal(payload.residence, null);
  assert.equal(payload.birth_date, null);

  // بيانات الربط والوقت
  assert.equal(payload.link_code, fakeMeta.linkCodeHash);
  assert.equal(payload.link_code_expires_at, fakeMeta.expiresAt);
  assert.equal(payload.joined_at, fakeMeta.joinedAt);
});

test("قبول معرّف القسم: الحقل الوحيد المقبول من الطلب ويُحفظ بشكل سليم", () => {
  const payload = buildMemberInsertPayload(
    { departmentId: "dept-tech-01", role: "SUPER_ADMIN" },
    { linkCodeHash: "dummy_hash", expiresAt: "2026-10-15T00:00:00.000Z" }
  );

  assert.equal(payload.department_id, "dept-tech-01");
  assert.equal(payload.role, "VOLUNTEER");
});

test("القسم اختياري: إذا تُرك فارغاً أو لم يُرسل يُخزن null", () => {
  const payload1 = buildMemberInsertPayload(
    {},
    { linkCodeHash: "dummy_hash", expiresAt: "2026-10-15T00:00:00.000Z" }
  );
  assert.equal(payload1.department_id, null);

  const payload2 = buildMemberInsertPayload(
    { departmentId: "   " },
    { linkCodeHash: "dummy_hash", expiresAt: "2026-10-15T00:00:00.000Z" }
  );
  assert.equal(payload2.department_id, null);
});
