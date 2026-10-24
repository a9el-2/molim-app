import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateNewTaskFields,
  mapClaimError,
  canViewTaskAssignments,
} from "../src/app/lib/task-assignments-policy.ts";

// ══════════════════════════════════════════════════════════════
// validateNewTaskFields
// ══════════════════════════════════════════════════════════════

// ── title ──
test("validateNewTaskFields: title إجباري – فارغ يرفض", () => {
  const r = validateNewTaskFields({ title: "" });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "title");
});

test("validateNewTaskFields: title إجباري – null يرفض", () => {
  const r = validateNewTaskFields({ title: null });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "title");
});

test("validateNewTaskFields: title يقبل نصاً صالحاً", () => {
  const r = validateNewTaskFields({ title: "مهمة تصميم الشعار" });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: title أطول من 150 حرف يرفض", () => {
  const r = validateNewTaskFields({ title: "أ".repeat(151) });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "title");
});

test("validateNewTaskFields: title بالضبط 150 حرف يقبل", () => {
  const r = validateNewTaskFields({ title: "أ".repeat(150) });
  assert.equal(r.valid, true);
});

// ── description ──
test("validateNewTaskFields: description اختياري – undefined يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان" });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: description أطول من 2000 حرف يرفض", () => {
  const r = validateNewTaskFields({
    title: "عنوان",
    description: "ب".repeat(2001),
  });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "description");
});

test("validateNewTaskFields: description بالضبط 2000 حرف يقبل", () => {
  const r = validateNewTaskFields({
    title: "عنوان",
    description: "ب".repeat(2000),
  });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: description غير نصي يرفض", () => {
  const r = validateNewTaskFields({ title: "عنوان", description: 123 });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "description");
});

// ── requiredAssignees ──
test("validateNewTaskFields: requiredAssignees=null يقبل (بلا حد)", () => {
  const r = validateNewTaskFields({ title: "عنوان", requiredAssignees: null });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: requiredAssignees=1 يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان", requiredAssignees: 1 });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: requiredAssignees=50 يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان", requiredAssignees: 50 });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: requiredAssignees=0 يرفض", () => {
  const r = validateNewTaskFields({ title: "عنوان", requiredAssignees: 0 });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "requiredAssignees");
});

test("validateNewTaskFields: requiredAssignees=51 يرفض", () => {
  const r = validateNewTaskFields({ title: "عنوان", requiredAssignees: 51 });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "requiredAssignees");
});

test("validateNewTaskFields: requiredAssignees=1.5 (غير صحيح) يرفض", () => {
  const r = validateNewTaskFields({ title: "عنوان", requiredAssignees: 1.5 });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "requiredAssignees");
});

// ── priority ──
test("validateNewTaskFields: priority=normal يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان", priority: "normal" });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: priority=urgent يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان", priority: "urgent" });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: priority=high يرفض", () => {
  const r = validateNewTaskFields({ title: "عنوان", priority: "high" });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "priority");
});

test("validateNewTaskFields: priority غير موجود (undefined) يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان" });
  assert.equal(r.valid, true);
});

// ── dueDate ──
test("validateNewTaskFields: dueDate اختياري – undefined يقبل", () => {
  const r = validateNewTaskFields({ title: "عنوان" });
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: dueDate اليوم نفسه يقبل", () => {
  // اليوم بتوقيت الرياض
  const now = new Date("2026-10-24T12:00:00+03:00");
  const r = validateNewTaskFields(
    { title: "عنوان", dueDate: "2026-10-24" },
    now
  );
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: dueDate مستقبلي يقبل", () => {
  const now = new Date("2026-10-24T12:00:00+03:00");
  const r = validateNewTaskFields(
    { title: "عنوان", dueDate: "2026-11-01" },
    now
  );
  assert.equal(r.valid, true);
});

test("validateNewTaskFields: dueDate ماضٍ يرفض", () => {
  const now = new Date("2026-10-24T12:00:00+03:00");
  const r = validateNewTaskFields(
    { title: "عنوان", dueDate: "2026-10-23" },
    now
  );
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "dueDate");
});

test("validateNewTaskFields: dueDate بصيغة غير صحيحة يرفض", () => {
  const r = validateNewTaskFields({ title: "عنوان", dueDate: "24/10/2026" });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "dueDate");
});

test("validateNewTaskFields: dueDate تاريخ غير موجود يرفض (2026-02-30)", () => {
  const r = validateNewTaskFields({ title: "عنوان", dueDate: "2026-02-30" });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.field, "dueDate");
});

// ══════════════════════════════════════════════════════════════
// mapClaimError
// ══════════════════════════════════════════════════════════════

test("mapClaimError: TASK_NOT_FOUND → 404", () => {
  const r = mapClaimError("TASK_NOT_FOUND: uuid-xxx");
  assert.equal(r.status, 404);
  assert.equal(r.code, "TASK_NOT_FOUND");
});

test("mapClaimError: USER_NOT_FOUND → 404", () => {
  const r = mapClaimError("USER_NOT_FOUND");
  assert.equal(r.status, 404);
  assert.equal(r.code, "USER_NOT_FOUND");
});

test("mapClaimError: ASSIGNMENT_NOT_FOUND → 404", () => {
  const r = mapClaimError("ASSIGNMENT_NOT_FOUND: abc");
  assert.equal(r.status, 404);
  assert.equal(r.code, "ASSIGNMENT_NOT_FOUND");
});

test("mapClaimError: TASK_NOT_OPEN → 409", () => {
  const r = mapClaimError("TASK_NOT_OPEN");
  assert.equal(r.status, 409);
  assert.equal(r.code, "TASK_NOT_OPEN");
});

test("mapClaimError: TASK_FULL → 409", () => {
  const r = mapClaimError("TASK_FULL");
  assert.equal(r.status, 409);
  assert.equal(r.code, "TASK_FULL");
});

test("mapClaimError: ALREADY_ASSIGNED → 409", () => {
  const r = mapClaimError("ALREADY_ASSIGNED");
  assert.equal(r.status, 409);
  assert.equal(r.code, "ALREADY_ASSIGNED");
});

test("mapClaimError: ACTIVE_LIMIT → 409", () => {
  const r = mapClaimError("ACTIVE_LIMIT: max=5");
  assert.equal(r.status, 409);
  assert.equal(r.code, "ACTIVE_LIMIT");
});

test("mapClaimError: NOT_ELIGIBLE → 403", () => {
  const r = mapClaimError("NOT_ELIGIBLE: reason=department");
  assert.equal(r.status, 403);
  assert.equal(r.code, "NOT_ELIGIBLE");
});

test("mapClaimError: خطأ غير معروف → 500 برسالة عامة بدون تسريب", () => {
  const r = mapClaimError("SOME_INTERNAL_DB_ERROR: secret details");
  assert.equal(r.status, 500);
  assert.equal(r.code, "INTERNAL_ERROR");
  // التأكد من عدم تسريب التفاصيل
  assert.ok(!r.message.includes("SOME_INTERNAL_DB_ERROR"));
  assert.ok(!r.message.includes("secret"));
});

test("mapClaimError: رسالة فارغة → 500 برسالة عامة", () => {
  const r = mapClaimError("");
  assert.equal(r.status, 500);
  assert.equal(r.code, "INTERNAL_ERROR");
});

// ══════════════════════════════════════════════════════════════
// canViewTaskAssignments
// ══════════════════════════════════════════════════════════════

test("canViewTaskAssignments: العضو يرى نفسه", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "user-1", role: "VOLUNTEER", departmentId: "dept-a" },
      { id: "user-1", departmentId: "dept-a" }
    ),
    true
  );
});

test("canViewTaskAssignments: VOLUNTEER لا يرى شخصاً آخر", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "user-1", role: "VOLUNTEER", departmentId: "dept-a" },
      { id: "user-2", departmentId: "dept-a" }
    ),
    false
  );
});

test("canViewTaskAssignments: VOLUNTEER لا يرى شخصاً في قسم مختلف", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "user-1", role: "VOLUNTEER", departmentId: "dept-a" },
      { id: "user-2", departmentId: "dept-b" }
    ),
    false
  );
});

test("canViewTaskAssignments: DEPARTMENT_HEAD يرى نفسه", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "head-1", role: "DEPARTMENT_HEAD", departmentId: "dept-a" },
      { id: "head-1", departmentId: "dept-a" }
    ),
    true
  );
});

test("canViewTaskAssignments: DEPARTMENT_HEAD يرى عضو نفس القسم", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "head-1", role: "DEPARTMENT_HEAD", departmentId: "dept-a" },
      { id: "vol-1", departmentId: "dept-a" }
    ),
    true
  );
});

test("canViewTaskAssignments: DEPARTMENT_HEAD لا يرى عضو قسم آخر", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "head-1", role: "DEPARTMENT_HEAD", departmentId: "dept-a" },
      { id: "vol-2", departmentId: "dept-b" }
    ),
    false
  );
});

test("canViewTaskAssignments: DEPARTMENT_HEAD بلا قسم لا يرى أحداً غير نفسه", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "head-1", role: "DEPARTMENT_HEAD", departmentId: null },
      { id: "vol-1", departmentId: "dept-a" }
    ),
    false
  );
});

test("canViewTaskAssignments: HR يرى الجميع", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "hr-1", role: "HR", departmentId: null },
      { id: "vol-99", departmentId: "dept-z" }
    ),
    true
  );
});

test("canViewTaskAssignments: ADMIN يرى الجميع", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "admin-1", role: "ADMIN", departmentId: null },
      { id: "vol-99", departmentId: "dept-z" }
    ),
    true
  );
});

test("canViewTaskAssignments: SUPER_ADMIN يرى الجميع", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "sa-1", role: "SUPER_ADMIN", departmentId: null },
      { id: "vol-99", departmentId: "dept-z" }
    ),
    true
  );
});

test("canViewTaskAssignments: SUPER_ADMIN يرى عضو في قسم مختلف", () => {
  assert.equal(
    canViewTaskAssignments(
      { id: "sa-1", role: "SUPER_ADMIN", departmentId: "dept-a" },
      { id: "vol-99", departmentId: "dept-b" }
    ),
    true
  );
});
