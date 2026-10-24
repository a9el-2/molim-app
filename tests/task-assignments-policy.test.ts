import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SEAT_STATUSES,
  validateNewTaskFields,
  mapClaimError,
  canViewTaskAssignments,
  isTaskAvailableForUser,
  decideTaskAssignmentToPerson,
  containsDepartment,
} from "../src/app/lib/task-assignments-policy.ts";

// ══════════════════════════════════════════════════════════════
// SEAT_STATUSES
// ══════════════════════════════════════════════════════════════

test("SEAT_STATUSES: يطابق الحالات الرسمية لشغل مقعد المهمة", () => {
  assert.deepEqual(SEAT_STATUSES, [
    "in_progress",
    "submitted",
    "needs_revision",
    "approved",
  ]);
});

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

// ══════════════════════════════════════════════════════════════
// isTaskAvailableForUser
// ══════════════════════════════════════════════════════════════

test("isTaskAvailableForUser: العضو غير النشط لا تظهر له أي مهمة", () => {
  const inactiveUser = {
    id: "MOL-00001",
    role: "SUPER_ADMIN" as const,
    departmentId: "dept-tech",
    status: "inactive",
  };
  const task = {
    id: "task-1",
    lifecycle_status: "open",
    target_type: "all_departments",
  };
  assert.equal(isTaskAvailableForUser(task, inactiveUser), false);
});

test("isTaskAvailableForUser: مهمة ليست open لا تظهر", () => {
  const activeUser = {
    id: "MOL-00001",
    role: "VOLUNTEER" as const,
    departmentId: "dept-tech",
    status: "active",
  };
  const closedTask = {
    id: "task-1",
    lifecycle_status: "completed",
    target_type: "all_departments",
  };
  assert.equal(isTaskAvailableForUser(closedTask, activeUser), false);
});

test("isTaskAvailableForUser: نوع self – يظهر فقط للمنشئ أو المعني", () => {
  const ownerUser = {
    id: "MOL-11111",
    role: "VOLUNTEER" as const,
    departmentId: "dept-tech",
    status: "active",
  };
  const otherUser = {
    id: "MOL-22222",
    role: "VOLUNTEER" as const,
    departmentId: "dept-tech",
    status: "active",
  };
  const selfTask = {
    id: "task-self",
    lifecycle_status: "open",
    target_type: "self",
    created_by: "MOL-11111",
    target_user_id: "MOL-11111",
  };

  assert.equal(isTaskAvailableForUser(selfTask, ownerUser), true);
  assert.equal(isTaskAvailableForUser(selfTask, otherUser), false);
});

test("isTaskAvailableForUser: نوع person – لا يظهر في قائمة الاستلام العام لأي شخص", () => {
  const targetUser = {
    id: "MOL-11111",
    role: "VOLUNTEER" as const,
    departmentId: "dept-tech",
    status: "active",
  };
  const otherUser = {
    id: "MOL-22222",
    role: "VOLUNTEER" as const,
    departmentId: "dept-tech",
    status: "active",
  };
  const personTask = {
    id: "task-person",
    lifecycle_status: "open",
    target_type: "person",
    created_by: "MOL-99999",
    target_user_id: "MOL-11111",
  };

  assert.equal(isTaskAvailableForUser(personTask, targetUser), false);
  assert.equal(isTaskAvailableForUser(personTask, otherUser), false);
});

test("isTaskAvailableForUser: نوع department – يظهر لأعضاء القسم فقط", () => {
  const member = {
    id: "MOL-11111",
    role: "VOLUNTEER" as const,
    departmentId: "dept-media",
    status: "active",
  };
  const foreignMember = {
    id: "MOL-22222",
    role: "VOLUNTEER" as const,
    departmentId: "dept-finance",
    status: "active",
  };
  const deptTask = {
    id: "task-dept",
    lifecycle_status: "open",
    target_type: "department",
    department_id: "dept-media",
    target_department_ids: ["dept-media"],
  };

  assert.equal(isTaskAvailableForUser(deptTask, member), true);
  assert.equal(isTaskAvailableForUser(deptTask, foreignMember), false);
});

test("isTaskAvailableForUser: نوع multiple_departments – مصفوفة عادية أو jsonb", () => {
  const mediaMember = {
    id: "MOL-11111",
    role: "VOLUNTEER" as const,
    departmentId: "dept-media",
    status: "active",
  };
  const itMember = {
    id: "MOL-22222",
    role: "VOLUNTEER" as const,
    departmentId: "dept-it",
    status: "active",
  };
  const hrMember = {
    id: "MOL-33333",
    role: "VOLUNTEER" as const,
    departmentId: "dept-hr",
    status: "active",
  };

  const multiTaskArray = {
    id: "task-multi-1",
    lifecycle_status: "open",
    target_type: "multiple_departments",
    target_department_ids: ["dept-media", "dept-it"],
  };

  const multiTaskJsonString = {
    id: "task-multi-2",
    lifecycle_status: "open",
    target_type: "multiple_departments",
    target_department_ids: '["dept-media", "dept-it"]',
  };

  assert.equal(isTaskAvailableForUser(multiTaskArray, mediaMember), true);
  assert.equal(isTaskAvailableForUser(multiTaskArray, itMember), true);
  assert.equal(isTaskAvailableForUser(multiTaskArray, hrMember), false);

  assert.equal(isTaskAvailableForUser(multiTaskJsonString, mediaMember), true);
  assert.equal(isTaskAvailableForUser(multiTaskJsonString, itMember), true);
  assert.equal(isTaskAvailableForUser(multiTaskJsonString, hrMember), false);
});

test("isTaskAvailableForUser: نوع all_departments – يظهر لأي عضو نشط", () => {
  const vol = {
    id: "MOL-1",
    role: "VOLUNTEER" as const,
    departmentId: "dept-1",
    status: "active",
  };
  const head = {
    id: "MOL-2",
    role: "DEPARTMENT_HEAD" as const,
    departmentId: null,
    status: "active",
  };
  const allTask = {
    id: "task-all",
    lifecycle_status: "open",
    target_type: "all_departments",
  };

  assert.equal(isTaskAvailableForUser(allTask, vol), true);
  assert.equal(isTaskAvailableForUser(allTask, head), true);
});

test("isTaskAvailableForUser: نوع upper_management – ADMIN و SUPER_ADMIN فقط", () => {
  const admin = {
    id: "MOL-A",
    role: "ADMIN" as const,
    departmentId: null,
    status: "active",
  };
  const superAdmin = {
    id: "MOL-S",
    role: "SUPER_ADMIN" as const,
    departmentId: null,
    status: "active",
  };
  const hr = {
    id: "MOL-H",
    role: "HR" as const,
    departmentId: null,
    status: "active",
  };
  const head = {
    id: "MOL-D",
    role: "DEPARTMENT_HEAD" as const,
    departmentId: "dept-1",
    status: "active",
  };
  const vol = {
    id: "MOL-V",
    role: "VOLUNTEER" as const,
    departmentId: "dept-1",
    status: "active",
  };

  const upperTask = {
    id: "task-upper",
    lifecycle_status: "open",
    target_type: "upper_management",
  };

  assert.equal(isTaskAvailableForUser(upperTask, admin), true);
  assert.equal(isTaskAvailableForUser(upperTask, superAdmin), true);
  assert.equal(isTaskAvailableForUser(upperTask, hr), false);
  assert.equal(isTaskAvailableForUser(upperTask, head), false);
  assert.equal(isTaskAvailableForUser(upperTask, vol), false);
});

// ══════════════════════════════════════════════════════════════
// decideTaskAssignmentToPerson
// ══════════════════════════════════════════════════════════════

test("decideTaskAssignmentToPerson: DEPARTMENT_HEAD لأعضاء قسمه فقط", () => {
  const ok = decideTaskAssignmentToPerson("DEPARTMENT_HEAD", "dept-tech", "dept-tech");
  assert.equal(ok.allowed, true);

  const mismatch = decideTaskAssignmentToPerson("DEPARTMENT_HEAD", "dept-tech", "dept-hr");
  assert.equal(mismatch.allowed, false);
  if (!mismatch.allowed) assert.equal(mismatch.reason, "department_mismatch");

  const noDept = decideTaskAssignmentToPerson("DEPARTMENT_HEAD", null, "dept-tech");
  assert.equal(noDept.allowed, false);
  if (!noDept.allowed) assert.equal(noDept.reason, "department_mismatch");
});

test("decideTaskAssignmentToPerson: HR و ADMIN و SUPER_ADMIN لأي عضو", () => {
  for (const role of ["HR", "ADMIN", "SUPER_ADMIN"] as const) {
    const res = decideTaskAssignmentToPerson(role, "dept-a", "dept-b");
    assert.equal(res.allowed, true, `يُتوقع السماح لـ ${role}`);
  }
});

test("decideTaskAssignmentToPerson: VOLUNTEER لا يملك صلاحية توجيه مهمة لعضو آخر", () => {
  const res = decideTaskAssignmentToPerson("VOLUNTEER", "dept-tech", "dept-tech");
  assert.equal(res.allowed, false);
  if (!res.allowed) assert.equal(res.reason, "role_not_allowed");
});
