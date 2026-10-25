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
  validateReason,
  mapReviewError,
  decideAssignmentAction,
  decideReviewPermission,
  decideTaskReassignment,
  mapManageError,
  decideReleasePermission,
  decideCancelPermission,
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

test("isTaskAvailableForUser: ترجع false لنوع person ولو كانت المهمة open والعضو نشط", () => {
  const activeMember = {
    id: "MOL-33333",
    role: "DEPARTMENT_HEAD" as const,
    departmentId: "dept-media",
    status: "active",
  };
  const openPersonTask = {
    id: "task-person-open",
    lifecycle_status: "open",
    target_type: "person",
    target_user_id: "MOL-33333",
  };
  assert.equal(isTaskAvailableForUser(openPersonTask, activeMember), false);
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

// ══════════════════════════════════════════════════════════════
// validateReason
// ══════════════════════════════════════════════════════════════

test("validateReason: غير نصي يرفض", () => {
  assert.equal(validateReason(null).valid, false);
  assert.equal(validateReason(undefined).valid, false);
  assert.equal(validateReason(12345).valid, false);
  assert.equal(validateReason({}).valid, false);
});

test("validateReason: أقل من 10 أحرف بعد trim يرفض", () => {
  assert.equal(validateReason("").valid, false);
  assert.equal(validateReason("   قصيرة   ").valid, false);
  assert.equal(validateReason("123456789").valid, false);
});

test("validateReason: أطول من 1000 حرف يرفض", () => {
  const longText = "أ".repeat(1001);
  assert.equal(validateReason(longText).valid, false);
});

test("validateReason: 10 أحرف صالحة يقبل ويرجع النص مقتطع الأطراف", () => {
  const text = "  اعتذار بسبب ظروف طارئة  ";
  const r = validateReason(text);
  assert.equal(r.valid, true);
  if (r.valid) {
    assert.equal(r.reason, "اعتذار بسبب ظروف طارئة");
  }
});

test("validateReason: بالضبط 10 أحرف يقبل", () => {
  const r = validateReason("1234567890");
  assert.equal(r.valid, true);
  if (r.valid) {
    assert.equal(r.reason, "1234567890");
  }
});

test("validateReason: بالضبط 1000 حرف يقبل", () => {
  const r = validateReason("أ".repeat(1000));
  assert.equal(r.valid, true);
});

// ══════════════════════════════════════════════════════════════
// mapReviewError
// ══════════════════════════════════════════════════════════════

test("mapReviewError: ASSIGNMENT_NOT_FOUND و TASK_NOT_FOUND ترجع 404", () => {
  const res1 = mapReviewError("ASSIGNMENT_NOT_FOUND: 123");
  assert.equal(res1.status, 404);
  assert.equal(res1.code, "ASSIGNMENT_NOT_FOUND");

  const res2 = mapReviewError("TASK_NOT_FOUND");
  assert.equal(res2.status, 404);
  assert.equal(res2.code, "TASK_NOT_FOUND");
});

test("mapReviewError: NOT_SUBMITTED ترجع 409", () => {
  const res = mapReviewError("NOT_SUBMITTED");
  assert.equal(res.status, 409);
  assert.equal(res.code, "NOT_SUBMITTED");
});

test("mapReviewError: SELF_REVIEW ترجع 403", () => {
  const res = mapReviewError("SELF_REVIEW");
  assert.equal(res.status, 403);
  assert.equal(res.code, "SELF_REVIEW");
});

test("mapReviewError: NOTES_REQUIRED و INVALID_HOURS و INVALID_DECISION ترجع 400", () => {
  const rNotes = mapReviewError("NOTES_REQUIRED");
  assert.equal(rNotes.status, 400);
  assert.equal(rNotes.code, "NOTES_REQUIRED");

  const rHours = mapReviewError("INVALID_HOURS");
  assert.equal(rHours.status, 400);
  assert.equal(rHours.code, "INVALID_HOURS");

  const rDecision = mapReviewError("INVALID_DECISION");
  assert.equal(rDecision.status, 400);
  assert.equal(rDecision.code, "INVALID_DECISION");
});

test("mapReviewError: خطأ غير متوقع يرجع 500 بدون تسريب تفاصيل", () => {
  const res = mapReviewError("SOME_INTERNAL_DB_CRASH_DETAIL");
  assert.equal(res.status, 500);
  assert.equal(res.code, "INTERNAL_ERROR");
});

// ══════════════════════════════════════════════════════════════
// decideAssignmentAction
// ══════════════════════════════════════════════════════════════

test("decideAssignmentAction: يرفض إذا لم يكن الفاعل صاحب التكليف (403)", () => {
  const actor = { id: "user-1", status: "active" };
  const assignment = { id: "asgn-1", user_id: "user-2", status: "offered" };

  const res = decideAssignmentAction(actor, assignment, "decline");
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "not_owner");
  }
});

test("decideAssignmentAction: يرفض إذا كان حساب المستخدم غير نشط (403)", () => {
  const actor = { id: "user-1", status: "suspended" };
  const assignment = { id: "asgn-1", user_id: "user-1", status: "offered" };

  const res = decideAssignmentAction(actor, assignment, "decline");
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "inactive_user");
  }
});

test("decideAssignmentAction: decline مسموح من offered فقط (409 لغيرها)", () => {
  const actor = { id: "user-1", status: "active" };

  const ok = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "offered" }, "decline");
  assert.equal(ok.allowed, true);

  const failInProgress = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "in_progress" }, "decline");
  assert.equal(failInProgress.allowed, false);
  if (!failInProgress.allowed) assert.equal(failInProgress.statusCode, 409);

  const failSubmitted = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "submitted" }, "decline");
  assert.equal(failSubmitted.allowed, false);
  if (!failSubmitted.allowed) assert.equal(failSubmitted.statusCode, 409);
});

test("decideAssignmentAction: withdraw مسموح من in_progress و needs_revision فقط (409 لغيرهما)", () => {
  const actor = { id: "user-1", status: "active" };

  const okProgress = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "in_progress" }, "withdraw");
  assert.equal(okProgress.allowed, true);

  const okRevision = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "needs_revision" }, "withdraw");
  assert.equal(okRevision.allowed, true);

  const failOffered = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "offered" }, "withdraw");
  assert.equal(failOffered.allowed, false);
  if (!failOffered.allowed) assert.equal(failOffered.statusCode, 409);

  const failSubmitted = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "submitted" }, "withdraw");
  assert.equal(failSubmitted.allowed, false);
  if (!failSubmitted.allowed) assert.equal(failSubmitted.statusCode, 409);
});

test("decideAssignmentAction: submit مسموح من in_progress و needs_revision فقط (409 لغيرهما)", () => {
  const actor = { id: "user-1", status: "active" };

  const okProgress = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "in_progress" }, "submit");
  assert.equal(okProgress.allowed, true);

  const okRevision = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "needs_revision" }, "submit");
  assert.equal(okRevision.allowed, true);

  const failOffered = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "offered" }, "submit");
  assert.equal(failOffered.allowed, false);
  if (!failOffered.allowed) assert.equal(failOffered.statusCode, 409);

  const failApproved = decideAssignmentAction(actor, { id: "a1", user_id: "user-1", status: "approved" }, "submit");
  assert.equal(failApproved.allowed, false);
  if (!failApproved.allowed) assert.equal(failApproved.statusCode, 409);
});

// ══════════════════════════════════════════════════════════════
// decideReviewPermission
// ══════════════════════════════════════════════════════════════

test("decideReviewPermission: VOLUNTEER لا يملك صلاحية المراجعة نهائياً", () => {
  const vol = { id: "u-vol", role: "VOLUNTEER" as const, departmentId: "dept-1" };
  const owner = { id: "u-other", role: "VOLUNTEER" as const, departmentId: "dept-1" };

  const res = decideReviewPermission(vol, owner);
  assert.equal(res.allowed, false);
  if (!res.allowed) assert.equal(res.reason, "role_not_allowed");
});

test("decideReviewPermission: المراجعة الذاتية مرفوضة إلا للسوبر أدمن الوحيد النشط", () => {
  const deptHead = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-1" };
  const hr = { id: "u-hr", role: "HR" as const, departmentId: null };
  const admin = { id: "u-admin", role: "ADMIN" as const, departmentId: null };
  const superAdmin = { id: "u-super", role: "SUPER_ADMIN" as const, departmentId: null };

  // غير مسموح للمراجع بمراجعة نفسه
  assert.equal(decideReviewPermission(deptHead, { id: "u-head", role: "DEPARTMENT_HEAD", departmentId: "dept-1" }).allowed, false);
  assert.equal(decideReviewPermission(hr, { id: "u-hr", role: "HR", departmentId: null }).allowed, false);
  assert.equal(decideReviewPermission(admin, { id: "u-admin", role: "ADMIN", departmentId: null }).allowed, false);

  // سوبر أدمن بوجود سوبر أدمن آخر نشط (soleActiveSuperAdmin=false)
  const resSuperNotSole = decideReviewPermission(superAdmin, { id: "u-super", role: "SUPER_ADMIN", departmentId: null }, false);
  assert.equal(resSuperNotSole.allowed, false);
  if (!resSuperNotSole.allowed) assert.equal(resSuperNotSole.reason, "self_review");

  // سوبر أدمن هو الوحيد النشط (soleActiveSuperAdmin=true) -> مسموح
  const resSuperSole = decideReviewPermission(superAdmin, { id: "u-super", role: "SUPER_ADMIN", departmentId: null }, true);
  assert.equal(resSuperSole.allowed, true);
});

test("decideReviewPermission: صاحب التكليف VOLUNTEER – رئيس القسم لنفس قسمه فقط، و HR/ADMIN/SUPER_ADMIN للجميع", () => {
  const ownerVol1 = { id: "u-vol1", role: "VOLUNTEER" as const, departmentId: "dept-tech" };
  const ownerVol2 = { id: "u-vol2", role: "VOLUNTEER" as const, departmentId: "dept-media" };

  const headTech = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech" };
  const headNoDept = { id: "u-head-none", role: "DEPARTMENT_HEAD" as const, departmentId: null };

  // رئيس قسم متطابق القسم
  assert.equal(decideReviewPermission(headTech, ownerVol1).allowed, true);

  // رئيس قسم مختلف القسم -> مرفوض
  const mismatch = decideReviewPermission(headTech, ownerVol2);
  assert.equal(mismatch.allowed, false);
  if (!mismatch.allowed) assert.equal(mismatch.reason, "department_mismatch");

  // رئيس قسم بلا قسم -> مرفوض
  assert.equal(decideReviewPermission(headNoDept, ownerVol1).allowed, false);

  // HR و ADMIN و SUPER_ADMIN
  const hr = { id: "u-hr", role: "HR" as const, departmentId: null };
  const admin = { id: "u-admin", role: "ADMIN" as const, departmentId: null };
  const superAdmin = { id: "u-super", role: "SUPER_ADMIN" as const, departmentId: null };

  assert.equal(decideReviewPermission(hr, ownerVol1).allowed, true);
  assert.equal(decideReviewPermission(admin, ownerVol1).allowed, true);
  assert.equal(decideReviewPermission(superAdmin, ownerVol1).allowed, true);
});

test("decideReviewPermission: صاحب التكليف DEPARTMENT_HEAD – لا يراجعه رئيس قسم، ويراجعه HR و ADMIN و SUPER_ADMIN", () => {
  const headOwner = { id: "u-head-owner", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech" };

  const anotherHead = { id: "u-head-2", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech" };
  const hr = { id: "u-hr", role: "HR" as const, departmentId: null };
  const admin = { id: "u-admin", role: "ADMIN" as const, departmentId: null };
  const superAdmin = { id: "u-super", role: "SUPER_ADMIN" as const, departmentId: null };

  // رئيس قسم آخر -> مرفوض
  const resHead = decideReviewPermission(anotherHead, headOwner);
  assert.equal(resHead.allowed, false);
  if (!resHead.allowed) assert.equal(resHead.reason, "role_not_allowed");

  // HR و ADMIN و SUPER_ADMIN -> مسموح
  assert.equal(decideReviewPermission(hr, headOwner).allowed, true);
  assert.equal(decideReviewPermission(admin, headOwner).allowed, true);
  assert.equal(decideReviewPermission(superAdmin, headOwner).allowed, true);
});

test("decideReviewPermission: صاحب التكليف HR أو ADMIN – يراجعه SUPER_ADMIN فقط، ولا يراجعه رئيس القسم أو HR أو ADMIN", () => {
  const hrOwner = { id: "u-hr-owner", role: "HR" as const, departmentId: null };
  const adminOwner = { id: "u-admin-owner", role: "ADMIN" as const, departmentId: null };

  const head = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech" };
  const hrReviewer = { id: "u-hr-2", role: "HR" as const, departmentId: null };
  const adminReviewer = { id: "u-admin-2", role: "ADMIN" as const, departmentId: null };
  const superAdmin = { id: "u-super", role: "SUPER_ADMIN" as const, departmentId: null };

  // رئيس قسم -> مرفوض
  assert.equal(decideReviewPermission(head, hrOwner).allowed, false);
  assert.equal(decideReviewPermission(head, adminOwner).allowed, false);

  // HR يراجع HR أو ADMIN -> مرفوض
  assert.equal(decideReviewPermission(hrReviewer, hrOwner).allowed, false);
  assert.equal(decideReviewPermission(hrReviewer, adminOwner).allowed, false);

  // ADMIN يراجع HR أو ADMIN -> مرفوض
  assert.equal(decideReviewPermission(adminReviewer, hrOwner).allowed, false);
  assert.equal(decideReviewPermission(adminReviewer, adminOwner).allowed, false);

  // SUPER_ADMIN يراجع HR و ADMIN -> مسموح
  assert.equal(decideReviewPermission(superAdmin, hrOwner).allowed, true);
  assert.equal(decideReviewPermission(superAdmin, adminOwner).allowed, true);
});

test("decideReviewPermission: صاحب التكليف SUPER_ADMIN – يراجعه SUPER_ADMIN آخر فقط", () => {
  const superOwner = { id: "u-super-owner", role: "SUPER_ADMIN" as const, departmentId: null };

  const head = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech" };
  const hr = { id: "u-hr", role: "HR" as const, departmentId: null };
  const admin = { id: "u-admin", role: "ADMIN" as const, departmentId: null };
  const otherSuper = { id: "u-super-2", role: "SUPER_ADMIN" as const, departmentId: null };

  assert.equal(decideReviewPermission(head, superOwner).allowed, false);
  assert.equal(decideReviewPermission(hr, superOwner).allowed, false);
  assert.equal(decideReviewPermission(admin, superOwner).allowed, false);

  // سوبر أدمن آخر -> مسموح
  assert.equal(decideReviewPermission(otherSuper, superOwner).allowed, true);
});

// ══════════════════════════════════════════════════════════════
// decideTaskReassignment
// ══════════════════════════════════════════════════════════════

test("decideTaskReassignment: الفاعل غير نشط يرفض (403)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "suspended" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-act" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "inactive_actor");
  }
});

test("decideTaskReassignment: التكليف الحالي ليس declined يرفض (409)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "in_progress" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-act" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 409);
    assert.equal(res.reason, "invalid_status");
  }
});

test("decideTaskReassignment: المهمة ليست من نوع person ترفض (400)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "department", lifecycle_status: "open", created_by: "u-act" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 400);
    assert.equal(res.reason, "invalid_target_type");
  }
});

test("decideTaskReassignment: المهمة ليست مفتوحة ترفض (409)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "completed", created_by: "u-act" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 409);
    assert.equal(res.reason, "task_not_open");
  }
});

test("decideTaskReassignment: الفاعل ليس المنشئ وليس إدارة عليا يرفض (403)", () => {
  const actor = { id: "u-other", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-creator" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "role_not_allowed");
  }
});

test("decideTaskReassignment: إعادة التوجيه لنفس العضو المعتذر يرفض (400)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-act" };
  const target = { id: "u-prev", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 400);
    assert.equal(res.reason, "same_declined_user");
  }
});

test("decideTaskReassignment: العضو المستهدف غير نشط يرفض (403)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-act" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "d-1", status: "suspended" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "inactive_target_user");
  }
});

test("decideTaskReassignment: رئيس قسم أنشأ المهمة يعيد توجيهها لعضو قسمه يقبل، ولقسم آخر يرفض", () => {
  const headActor = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech", status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-head" };

  const targetSameDept = { id: "u-new-1", role: "VOLUNTEER" as const, departmentId: "dept-tech", status: "active" };
  const targetOtherDept = { id: "u-new-2", role: "VOLUNTEER" as const, departmentId: "dept-media", status: "active" };

  // نفس القسم -> مسموح
  assert.equal(decideTaskReassignment(headActor, asgn, task, targetSameDept).allowed, true);

  // قسم آخر -> مرفوض
  const failDept = decideTaskReassignment(headActor, asgn, task, targetOtherDept);
  assert.equal(failDept.allowed, false);
  if (!failDept.allowed) {
    assert.equal(failDept.statusCode, 403);
    assert.equal(failDept.reason, "department_mismatch");
  }
});

test("decideTaskReassignment: HR أو ADMIN أو SUPER_ADMIN يعيد التوجيه لأي عضو نشط يقبل", () => {
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-creator-other" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: "dept-xyz", status: "active" };

  for (const role of ["HR", "ADMIN", "SUPER_ADMIN"] as const) {
    const actor = { id: `u-${role.toLowerCase()}`, role, departmentId: null, status: "active" };
    const res = decideTaskReassignment(actor, asgn, task, target);
    assert.equal(res.allowed, true, `يُتوقع السماح لدور ${role}`);
  }
});

test("decideTaskReassignment: رئيس قسم أنشأ المهمة لكن المستهدف قسمه null يرفض (department_mismatch)", () => {
  const actor = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech", status: "active" };
  const asgn = { id: "a-1", user_id: "u-prev", status: "declined" };
  const task = { id: "t-1", target_type: "person", lifecycle_status: "open", created_by: "u-head" };
  const target = { id: "u-new", role: "VOLUNTEER" as const, departmentId: null, status: "active" };

  const res = decideTaskReassignment(actor, asgn, task, target);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "department_mismatch");
  }
});

// ══════════════════════════════════════════════════════════════
// mapManageError
// ══════════════════════════════════════════════════════════════

test("mapManageError: تحويل الأخطاء المعروفة إلى رموز HTTP المتوقعة", () => {
  // REASON_REQUIRED -> 400
  const r1 = mapManageError("REASON_REQUIRED: السبب قصير جداً");
  assert.equal(r1.status, 400);
  assert.equal(r1.code, "REASON_REQUIRED");

  // INVALID_STATUS -> 409
  const r2 = mapManageError("INVALID_STATUS: لا يمكن تنفيذ الإجراء");
  assert.equal(r2.status, 409);
  assert.equal(r2.code, "INVALID_STATUS");

  // ASSIGNMENT_NOT_FOUND -> 404
  const r3 = mapManageError("ASSIGNMENT_NOT_FOUND: السجل غير موجود");
  assert.equal(r3.status, 404);
  assert.equal(r3.code, "ASSIGNMENT_NOT_FOUND");

  // TASK_NOT_FOUND -> 404
  const r4 = mapManageError("TASK_NOT_FOUND: المهمة غير موجودة");
  assert.equal(r4.status, 404);
  assert.equal(r4.code, "TASK_NOT_FOUND");

  // خطأ غير متوقع -> 500
  const r5 = mapManageError("SOMETHING_WEIRD: خطأ غير متوقع");
  assert.equal(r5.status, 500);
  assert.equal(r5.code, "INTERNAL_ERROR");
});

// ══════════════════════════════════════════════════════════════
// decideReleasePermission
// ══════════════════════════════════════════════════════════════

test("decideReleasePermission: الفاعل غير نشط يرفض (403)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "suspended" };
  const task = { id: "t-1", created_by: "u-creator" };
  const owner = { id: "u-owner", departmentId: "d-1" };

  const res = decideReleasePermission(actor, task, owner);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "inactive_actor");
  }
});

test("decideReleasePermission: لا أحد يسحب تكليفه بنفسه يرفض (403)", () => {
  const actor = { id: "u-owner", role: "ADMIN" as const, departmentId: "d-1", status: "active" };
  const task = { id: "t-1", created_by: "u-owner" };
  const owner = { id: "u-owner", departmentId: "d-1" };

  const res = decideReleasePermission(actor, task, owner);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "self_release_forbidden");
  }
});

test("decideReleasePermission: منشئ المهمة يسمح له بسحب تكليف غيره", () => {
  const actor = { id: "u-creator", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };
  const task = { id: "t-1", created_by: "u-creator" };
  const owner = { id: "u-other", departmentId: "d-2" };

  const res = decideReleasePermission(actor, task, owner);
  assert.equal(res.allowed, true);
});

test("decideReleasePermission: ADMIN و SUPER_ADMIN و HR يسمح لهم بسحب أي تكليف (ليس لأنفسهم)", () => {
  const task = { id: "t-1", created_by: "u-creator" };
  const owner = { id: "u-owner", departmentId: "d-other" };

  for (const role of ["ADMIN", "SUPER_ADMIN", "HR"] as const) {
    const actor = { id: `u-${role.toLowerCase()}`, role, departmentId: null, status: "active" };
    const res = decideReleasePermission(actor, task, owner);
    assert.equal(res.allowed, true, `يُتوقع السماح لدور ${role}`);
  }
});

test("decideReleasePermission: رئيس قسم يسحب لعضو قسمه فقط", () => {
  const actor = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech", status: "active" };
  const task = { id: "t-1", created_by: "u-creator" };

  const sameDeptOwner = { id: "u-1", departmentId: "dept-tech" };
  const otherDeptOwner = { id: "u-2", departmentId: "dept-media" };
  const nullDeptOwner = { id: "u-3", departmentId: null };

  // نفس القسم -> مسموح
  assert.equal(decideReleasePermission(actor, task, sameDeptOwner).allowed, true);

  // قسم آخر -> مرفوض
  const resOther = decideReleasePermission(actor, task, otherDeptOwner);
  assert.equal(resOther.allowed, false);
  if (!resOther.allowed) {
    assert.equal(resOther.statusCode, 403);
    assert.equal(resOther.reason, "department_mismatch");
  }

  // قسم فارغ -> مرفوض
  const resNull = decideReleasePermission(actor, task, nullDeptOwner);
  assert.equal(resNull.allowed, false);
  if (!resNull.allowed) {
    assert.equal(resNull.statusCode, 403);
    assert.equal(resNull.reason, "department_mismatch");
  }
});

test("decideReleasePermission: متطوع ليس المنشئ يرفض (403)", () => {
  const actor = { id: "u-vol", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };
  const task = { id: "t-1", created_by: "u-creator" };
  const owner = { id: "u-owner", departmentId: "d-1" };

  const res = decideReleasePermission(actor, task, owner);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "role_not_allowed");
  }
});

test("decideReleasePermission: مهمة شخصية (target_type='self') يمنع أي شخص عدا المنشئ من سحبها حتى لو كان ADMIN أو HR", () => {
  const task = { id: "t-self", created_by: "u-owner", target_type: "self" };
  const owner = { id: "u-owner", departmentId: null };

  for (const role of ["ADMIN", "SUPER_ADMIN", "HR"] as const) {
    const actor = { id: `u-${role.toLowerCase()}`, role, departmentId: null, status: "active" };
    const res = decideReleasePermission(actor, task, owner);
    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.equal(res.statusCode, 403);
      assert.equal(res.reason, "personal_task");
    }
  }
});

test("decideReleasePermission: مهمة شخصية (target_type='self') صاحبها يرفض بسحب تكليفه بنفسه (self_release_forbidden)", () => {
  const actor = { id: "u-owner", role: "VOLUNTEER" as const, departmentId: null, status: "active" };
  const task = { id: "t-self", created_by: "u-owner", target_type: "self" };
  const owner = { id: "u-owner", departmentId: null };

  const res = decideReleasePermission(actor, task, owner);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "self_release_forbidden");
  }
});

// ══════════════════════════════════════════════════════════════
// decideCancelPermission
// ══════════════════════════════════════════════════════════════

test("decideCancelPermission: الفاعل غير نشط يرفض (403)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "suspended" };
  const task = { id: "t-1", created_by: "u-act", department_id: null, lifecycle_status: "open" };

  const res = decideCancelPermission(actor, task);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "inactive_actor");
  }
});

test("decideCancelPermission: المهمة ليست مفتوحة ترفض (409)", () => {
  const actor = { id: "u-act", role: "ADMIN" as const, departmentId: null, status: "active" };
  const task = { id: "t-1", created_by: "u-act", department_id: null, lifecycle_status: "completed" };

  const res = decideCancelPermission(actor, task);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 409);
    assert.equal(res.reason, "task_not_open");
  }
});

test("decideCancelPermission: المنشئ يسمح له بإلغاء مهمته", () => {
  const actor = { id: "u-creator", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };
  const task = { id: "t-1", created_by: "u-creator", department_id: "d-2", lifecycle_status: "open" };

  const res = decideCancelPermission(actor, task);
  assert.equal(res.allowed, true);
});

test("decideCancelPermission: ADMIN و SUPER_ADMIN و HR يسمح لهم بإلغاء أي مهمة مفتوحة", () => {
  const task = { id: "t-1", created_by: "u-creator", department_id: "d-any", lifecycle_status: "open" };

  for (const role of ["ADMIN", "SUPER_ADMIN", "HR"] as const) {
    const actor = { id: `u-${role.toLowerCase()}`, role, departmentId: null, status: "active" };
    const res = decideCancelPermission(actor, task);
    assert.equal(res.allowed, true, `يُتوقع السماح لدور ${role}`);
  }
});

test("decideCancelPermission: رئيس قسم يلغي فقط مهمة مطابقة لقسمه", () => {
  const actor = { id: "u-head", role: "DEPARTMENT_HEAD" as const, departmentId: "dept-tech", status: "active" };

  const sameDeptTask = { id: "t-1", created_by: "u-other", department_id: "dept-tech", lifecycle_status: "open" };
  const otherDeptTask = { id: "t-2", created_by: "u-other", department_id: "dept-media", lifecycle_status: "open" };
  const nullDeptTask = { id: "t-3", created_by: "u-other", department_id: null, lifecycle_status: "open" };

  // نفس القسم -> مسموح
  assert.equal(decideCancelPermission(actor, sameDeptTask).allowed, true);

  // قسم آخر -> مرفوض
  const resOther = decideCancelPermission(actor, otherDeptTask);
  assert.equal(resOther.allowed, false);
  if (!resOther.allowed) {
    assert.equal(resOther.statusCode, 403);
    assert.equal(resOther.reason, "department_mismatch");
  }

  // قسم فارغ -> مرفوض
  const resNull = decideCancelPermission(actor, nullDeptTask);
  assert.equal(resNull.allowed, false);
  if (!resNull.allowed) {
    assert.equal(resNull.statusCode, 403);
    assert.equal(resNull.reason, "department_mismatch");
  }
});

test("decideCancelPermission: متطوع ليس المنشئ يرفض (403)", () => {
  const actor = { id: "u-vol", role: "VOLUNTEER" as const, departmentId: "d-1", status: "active" };
  const task = { id: "t-1", created_by: "u-creator", department_id: "d-1", lifecycle_status: "open" };

  const res = decideCancelPermission(actor, task);
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.statusCode, 403);
    assert.equal(res.reason, "role_not_allowed");
  }
});

test("decideCancelPermission: مهمة شخصية (target_type='self') يمنع أي شخص عدا المنشئ من إلغائها حتى لو كان ADMIN أو HR", () => {
  const task = { id: "t-self", created_by: "u-owner", department_id: null, lifecycle_status: "open", target_type: "self" };

  for (const role of ["ADMIN", "SUPER_ADMIN", "HR"] as const) {
    const actor = { id: `u-${role.toLowerCase()}`, role, departmentId: null, status: "active" };
    const res = decideCancelPermission(actor, task);
    assert.equal(res.allowed, false);
    if (!res.allowed) {
      assert.equal(res.statusCode, 403);
      assert.equal(res.reason, "personal_task");
    }
  }
});

test("decideCancelPermission: مهمة شخصية (target_type='self') صاحبها المنشئ يسمح له بإلغائها", () => {
  const actor = { id: "u-owner", role: "VOLUNTEER" as const, departmentId: null, status: "active" };
  const task = { id: "t-self", created_by: "u-owner", department_id: null, lifecycle_status: "open", target_type: "self" };

  const res = decideCancelPermission(actor, task);
  assert.equal(res.allowed, true);
});
