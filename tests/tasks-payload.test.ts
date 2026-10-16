import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeDepartmentIds,
  resolveTaskScope,
  buildTaskInsertPayload,
  canViewTask,
  buildTaskAuditLogPayload,
} from "../src/app/lib/tasks-payload.ts";
import type { UserRole } from "../src/app/lib/roles.ts";

test("تنظيف قائمة الأقسام: إزالة الفراغات والقيم غير النصية وتكرار المعرّفات", () => {
  const dirty = ["dept-1", "  dept-2  ", "dept-1", "", "   ", null, 123, "dept-3"];
  const cleaned = sanitizeDepartmentIds(dirty);

  assert.deepEqual(cleaned, ["dept-1", "dept-2", "dept-3"]);
  assert.deepEqual(sanitizeDepartmentIds(null), []);
  assert.deepEqual(sanitizeDepartmentIds(undefined), []);
  assert.deepEqual(sanitizeDepartmentIds("not-array"), []);
});

test("ربط النطاق بالحقول (resolveTaskScope): نطاق self", () => {
  const result = resolveTaskScope({
    scope: "self",
    creatorId: "user-100",
    creatorDepartmentId: "dept-a",
  });

  assert.equal(result.targetType, "self");
  assert.equal(result.targetUserId, "user-100");
  assert.equal(result.assignedTo, "user-100");
  assert.equal(result.departmentId, null);
  assert.deepEqual(result.targetDepartmentIds, []);
});

test("ربط النطاق بالحقول (resolveTaskScope): نطاق own_department", () => {
  const result = resolveTaskScope({
    scope: "own_department",
    creatorId: "head-1",
    creatorDepartmentId: "dept-media",
  });

  assert.equal(result.targetType, "department");
  assert.equal(result.targetUserId, null);
  assert.equal(result.assignedTo, null);
  assert.equal(result.departmentId, "dept-media");
  assert.deepEqual(result.targetDepartmentIds, ["dept-media"]);
});

test("ربط النطاق بالحقول (resolveTaskScope): نطاق departments لقسم واحد", () => {
  const result = resolveTaskScope({
    scope: "departments",
    creatorId: "admin-1",
    creatorDepartmentId: null,
    departmentIds: ["dept-hr"],
  });

  assert.equal(result.targetType, "department");
  assert.equal(result.targetUserId, null);
  assert.equal(result.assignedTo, null);
  assert.equal(result.departmentId, "dept-hr");
  assert.deepEqual(result.targetDepartmentIds, ["dept-hr"]);
});

test("ربط النطاق بالحقول (resolveTaskScope): نطاق departments لعدة أقسام", () => {
  const result = resolveTaskScope({
    scope: "departments",
    creatorId: "admin-1",
    creatorDepartmentId: null,
    departmentIds: ["dept-hr", "dept-tech", "dept-hr"], // مع تكرار
  });

  assert.equal(result.targetType, "multiple_departments");
  assert.equal(result.targetUserId, null);
  assert.equal(result.assignedTo, null);
  assert.equal(result.departmentId, null);
  assert.deepEqual(result.targetDepartmentIds, ["dept-hr", "dept-tech"]);
});

test("ربط النطاق بالحقول (resolveTaskScope): نطاق all", () => {
  const result = resolveTaskScope({
    scope: "all",
    creatorId: "super-1",
    creatorDepartmentId: null,
  });

  assert.equal(result.targetType, "all_departments");
  assert.equal(result.targetUserId, null);
  assert.equal(result.assignedTo, null);
  assert.equal(result.departmentId, null);
  assert.deepEqual(result.targetDepartmentIds, []);
});

test("بناء حمولة المهمة: تجاهل أي قيم حساسة أو مشبوهة من العميل وتثبيت الحالة الأولية in_progress", () => {
  const maliciousInput = {
    title: "  تصميم واجهة لوحة التحكم  ",
    description: "  وصف تفصيلي للمهمة  ",
    requestedHours: 3.5,
    dueDate: "2026-11-01",
    // حقول حساسة يحاول العميل حقنها:
    status: "completed",
    created_by: "hacker-99",
    assigned_to: "innocent-user",
    target_type: "all_departments",
    target_user_id: "hacker-target",
    department_id: "hacked-dept",
    reviewed_by: "admin-1",
    reviewed_at: "2026-10-16",
    review_decision: "approved",
    review_reason: "auto pass",
  };

  const context = {
    creatorId: "user-real-01",
    scopeResolved: {
      targetType: "self" as const,
      targetUserId: "user-real-01",
      assignedTo: "user-real-01",
      departmentId: null,
      targetDepartmentIds: [],
    },
  };

  const payload = buildTaskInsertPayload(maliciousInput, context);

  // القيم النظيفة والموثوقة
  assert.equal(payload.title, "تصميم واجهة لوحة التحكم");
  assert.equal(payload.description, "وصف تفصيلي للمهمة");
  assert.equal(payload.requested_hours, 3.5);
  assert.equal(payload.due_date, "2026-11-01");
  assert.equal(payload.created_by, "user-real-01");
  assert.equal(payload.target_type, "self");
  assert.equal(payload.target_user_id, "user-real-01");
  assert.equal(payload.assigned_to, "user-real-01");
  assert.equal(payload.department_id, null);
  assert.deepEqual(payload.target_department_ids, []);

  // الحالة الأولية in_progress دائماً وحقول المراجعة فارغة
  assert.equal(payload.status, "in_progress");
  assert.equal(payload.reviewed_by, null);
  assert.equal(payload.reviewed_at, null);
  assert.equal(payload.review_decision, null);
  assert.equal(payload.review_reason, null);
});

test("بناء حمولة تدقيق المهمة (buildTaskAuditLogPayload)", () => {
  const audit = buildTaskAuditLogPayload({
    actorId: "actor-1",
    action: "create_task",
    taskId: "task-99",
    departmentId: "dept-1",
    beforeData: null,
    afterData: { id: "task-99", title: "مهمة جديدة" },
    details: "تفاصيل العملية",
  });

  assert.equal(audit.category, "tasks");
  assert.equal(audit.action, "create_task");
  assert.equal(audit.target_type, "tasks");
  assert.equal(audit.target_id, "task-99");
  assert.equal(audit.target_user_id, "actor-1");
  assert.equal(audit.department_id, "dept-1");
  assert.equal(audit.before_data, null);
  assert.equal(audit.details, "تفاصيل العملية");
});

test("صلاحية الرؤية (canViewTask): الأدوار العليا (HR, ADMIN, SUPER_ADMIN) ترى كل المهام", () => {
  const roles: UserRole[] = ["HR", "ADMIN", "SUPER_ADMIN"];
  const foreignTask = {
    id: "task-secret",
    created_by: "other-user",
    target_user_id: "other-person",
    department_id: "other-dept",
    target_department_ids: ["other-dept"],
    target_type: "department",
  };

  for (const role of roles) {
    assert.equal(
      canViewTask({
        userRole: role,
        userId: "manager-user",
        userDepartmentId: "manager-dept",
        task: foreignTask,
      }),
      true,
      `يُتوقع أن يرى ${role} أي مهمة`
    );
  }
});

test("صلاحية الرؤية (canViewTask): المتطوع يرى فقط مهامه ومهام قسمه وما أنشأه وما هو عام", () => {
  const volunteerId = "vol-1";
  const volunteerDept = "dept-tech";

  // 1. مهمة أنشأها بنفسه
  assert.equal(
    canViewTask({
      userRole: "VOLUNTEER",
      userId: volunteerId,
      userDepartmentId: volunteerDept,
      task: { id: 1, created_by: volunteerId, target_type: "self" },
    }),
    true
  );

  // 2. مهمة موجهة إليه شخصياً
  assert.equal(
    canViewTask({
      userRole: "VOLUNTEER",
      userId: volunteerId,
      userDepartmentId: volunteerDept,
      task: { id: 2, created_by: "head-1", target_user_id: volunteerId },
    }),
    true
  );

  // 3. مهمة قسمه (department_id)
  assert.equal(
    canViewTask({
      userRole: "VOLUNTEER",
      userId: volunteerId,
      userDepartmentId: volunteerDept,
      task: { id: 3, created_by: "head-1", department_id: volunteerDept },
    }),
    true
  );

  // 4. مهمة تشمل قسمه ضمن target_department_ids
  assert.equal(
    canViewTask({
      userRole: "VOLUNTEER",
      userId: volunteerId,
      userDepartmentId: volunteerDept,
      task: { id: 4, created_by: "admin-1", target_department_ids: ["dept-media", volunteerDept] },
    }),
    true
  );

  // 5. مهمة عامة لجميع الأقسام
  assert.equal(
    canViewTask({
      userRole: "VOLUNTEER",
      userId: volunteerId,
      userDepartmentId: volunteerDept,
      task: { id: 5, created_by: "super-1", target_type: "all_departments" },
    }),
    true
  );

  // 6. مهمة قسم آخر لا صلة له بها -> ممنوع
  assert.equal(
    canViewTask({
      userRole: "VOLUNTEER",
      userId: volunteerId,
      userDepartmentId: volunteerDept,
      task: {
        id: 6,
        created_by: "head-foreign",
        department_id: "dept-finance",
        target_department_ids: ["dept-finance"],
        target_type: "department",
      },
    }),
    false
  );
});

test("صلاحية الرؤية (canViewTask): رئيس القسم يرى مهام قسمه وما أنشأه ولا يرى مهام الأقسام الأخرى الخاصة", () => {
  const headId = "head-1";
  const headDept = "dept-design";

  // مهمة أنشأها رئيس القسم
  assert.equal(
    canViewTask({
      userRole: "DEPARTMENT_HEAD",
      userId: headId,
      userDepartmentId: headDept,
      task: { id: 10, created_by: headId },
    }),
    true
  );

  // مهمة قسمه
  assert.equal(
    canViewTask({
      userRole: "DEPARTMENT_HEAD",
      userId: headId,
      userDepartmentId: headDept,
      task: { id: 11, created_by: "vol-design", department_id: headDept },
    }),
    true
  );

  // مهمة قسم آخر خاص
  assert.equal(
    canViewTask({
      userRole: "DEPARTMENT_HEAD",
      userId: headId,
      userDepartmentId: headDept,
      task: {
        id: 12,
        created_by: "vol-tech",
        department_id: "dept-tech",
        target_type: "self",
      },
    }),
    false
  );
});
