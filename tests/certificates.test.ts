import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkCertificateEligibility,
  countUserCompletedTasks,
  VOLUNTEER_MIN_HOURS,
  EXPERTISE_MIN_HOURS,
  PARTICIPATION_MIN_TASKS,
} from "../src/app/lib/certificates-policy.ts";

test("شهادة المشاركة: غير مؤهل إذا كان عدد المهام المكتملة 0", () => {
  const result = checkCertificateEligibility({
    type: "participation",
    userStatus: "active",
    approvedHours: 100, // حتى مع وجود ساعات كثيرة، يجب إكمال مهمة واحدة على الأقل
    completedTasksCount: 0,
  });

  assert.equal(result.isEligible, false);
  assert.equal(result.progressText, "0 / 1 مهمة مكتملة");
  assert.match(result.reason || "", /إكمال مهمة واحدة على الأقل/);
});

test("شهادة المشاركة: مؤهل إذا أنجز مهمة واحدة على الأقل وحسابه نشط", () => {
  const resultSingleTask = checkCertificateEligibility({
    type: "participation",
    userStatus: "active",
    approvedHours: 0,
    completedTasksCount: 1,
  });

  assert.equal(resultSingleTask.isEligible, true);
  assert.equal(resultSingleTask.progressText, "1 / 1 مهمة مكتملة");
  assert.equal(resultSingleTask.reason, undefined);

  const resultMultipleTasks = checkCertificateEligibility({
    type: "participation",
    userStatus: "active",
    approvedHours: 15,
    completedTasksCount: 4,
  });

  assert.equal(resultMultipleTasks.isEligible, true);
  assert.equal(resultMultipleTasks.progressText, "4 / 1 مهمة مكتملة");
});

test("شهادة المشاركة: غير مؤهل إذا كان الحساب غير نشط حتى ولو أنجز مهام", () => {
  const result = checkCertificateEligibility({
    type: "participation",
    userStatus: "inactive",
    approvedHours: 20,
    completedTasksCount: 3,
  });

  assert.equal(result.isEligible, false);
  assert.match(result.reason || "", /حسابك غير نشط/);
});

test("شهادة التطوع: اشتراط 40 ساعة معتمدة", () => {
  const below = checkCertificateEligibility({
    type: "volunteer",
    userStatus: "active",
    approvedHours: 39.75,
    completedTasksCount: 5,
  });
  assert.equal(below.isEligible, false);
  assert.equal(below.progressText, "39.75 / 40 ساعة");

  const exact = checkCertificateEligibility({
    type: "volunteer",
    userStatus: "active",
    approvedHours: 40,
    completedTasksCount: 0,
  });
  assert.equal(exact.isEligible, true);
  assert.equal(exact.progressText, "40 / 40 ساعة");
});

test("شهادة الخبرة: اشتراط 300 ساعة معتمدة", () => {
  const below = checkCertificateEligibility({
    type: "expertise",
    userStatus: "active",
    approvedHours: 299.5,
    completedTasksCount: 10,
  });
  assert.equal(below.isEligible, false);
  assert.equal(below.progressText, "299.5 / 300 ساعة");

  const exact = checkCertificateEligibility({
    type: "expertise",
    userStatus: "active",
    approvedHours: 300,
    completedTasksCount: 0,
  });
  assert.equal(exact.isEligible, true);
  assert.equal(exact.progressText, "300 / 300 ساعة");
});

test("حساب المهام المكتملة للمستخدم (countUserCompletedTasks)", () => {
  const currentUserId = "user-123";

  const tasks = [
    // مهمة مكتملة ومسندة له -> تُحسب
    {
      id: "t1",
      status: "completed",
      assigned_to: "user-123",
      target_user_id: null,
      created_by: "boss-1",
    },
    // مهمة مكتملة وموجهة له كـ target_user_id -> تُحسب
    {
      id: "t2",
      status: "completed",
      assigned_to: null,
      target_user_id: "user-123",
      created_by: "boss-2",
    },
    // مهمة أنشأها لنفسه وأكملها -> تُحسب
    {
      id: "t3",
      status: "completed",
      assigned_to: null,
      target_user_id: null,
      created_by: "user-123",
    },
    // مهمة قيد التنفيذ مسندة له -> لا تُحسب
    {
      id: "t4",
      status: "in_progress",
      assigned_to: "user-123",
      target_user_id: null,
      created_by: "boss-1",
    },
    // مهمة مكتملة لشخص آخر -> لا تُحسب
    {
      id: "t5",
      status: "completed",
      assigned_to: "other-user",
      target_user_id: null,
      created_by: "boss-1",
    },
  ];

  const approvedHours = [
    // سجل ساعات معتمد لنفس المهمة t1 -> لا يتضاعف العد
    { id: "h1", task_id: "t1", status: "approved" },
    // سجل ساعات معتمد لمهمة أخرى t6 غير موجودة في مصفوفة المهام -> يُحسب
    { id: "h2", task_id: "t6", status: "approved" },
    // سجل ساعات بدون مهمة -> لا يُحسب كمهمة
    { id: "h3", task_id: null, status: "approved" },
  ];

  const count = countUserCompletedTasks({
    userId: currentUserId,
    tasks,
    approvedHoursLogs: approvedHours,
  });

  // t1 + t2 + t3 + t6 = 4 مهام
  assert.equal(count, 4);
});

test("حساب المهام المكتملة: يعيد 0 عند عدم وجود أي مهام مكتملة للمستخدم", () => {
  const count = countUserCompletedTasks({
    userId: "user-empty",
    tasks: [
      {
        id: "t1",
        status: "in_progress",
        assigned_to: "user-empty",
      },
    ],
    approvedHoursLogs: [],
  });

  assert.equal(count, 0);
});
