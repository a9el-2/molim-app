import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideTaskCreation,
  decideHoursReview,
  resolveInitialHoursStatus,
  validateHoursSubmission,
  canEditOwnEntry,
} from "../src/app/lib/hours-policy.ts";

// ==========================================
// 1. اختبارات إنشاء المهام (decideTaskCreation)
// ==========================================

test("إنشاء المهام: متطوع ينشئ لنفسه فقط ومسموح له", () => {
  const result = decideTaskCreation({
    requesterRole: "VOLUNTEER",
    requesterDepartmentId: "dept-1",
    scope: "self",
  });
  assert.equal(result.allowed, true);
});

test("إنشاء المهام: متطوع لا ينشئ مهمة لقسم (مرفوض)", () => {
  const ownDept = decideTaskCreation({
    requesterRole: "VOLUNTEER",
    requesterDepartmentId: "dept-1",
    scope: "own_department",
  });
  assert.equal(ownDept.allowed, false);
  assert.equal(ownDept.reason, "role_not_allowed");

  const depts = decideTaskCreation({
    requesterRole: "VOLUNTEER",
    scope: "departments",
    departmentIds: ["dept-1", "dept-2"],
  });
  assert.equal(depts.allowed, false);

  const all = decideTaskCreation({
    requesterRole: "VOLUNTEER",
    scope: "all",
  });
  assert.equal(all.allowed, false);
});

test("إنشاء المهام: رئيس قسم لنفسه أو لقسمه فقط", () => {
  const self = decideTaskCreation({
    requesterRole: "DEPARTMENT_HEAD",
    requesterDepartmentId: "dept-1",
    scope: "self",
  });
  assert.equal(self.allowed, true);

  const own = decideTaskCreation({
    requesterRole: "DEPARTMENT_HEAD",
    requesterDepartmentId: "dept-1",
    scope: "own_department",
  });
  assert.equal(own.allowed, true);

  const noDept = decideTaskCreation({
    requesterRole: "DEPARTMENT_HEAD",
    requesterDepartmentId: null,
    scope: "own_department",
  });
  assert.equal(noDept.allowed, false);
  assert.equal(noDept.reason, "no_department");

  const otherDepts = decideTaskCreation({
    requesterRole: "DEPARTMENT_HEAD",
    requesterDepartmentId: "dept-1",
    scope: "departments",
    departmentIds: ["dept-2"],
  });
  assert.equal(otherDepts.allowed, false);
});

test("إنشاء المهام: HR و ADMIN لأنفسهم أو لقسم أو عدة أقسام", () => {
  for (const role of ["HR", "ADMIN"] as const) {
    const multi = decideTaskCreation({
      requesterRole: role,
      scope: "departments",
      departmentIds: ["dept-1", "dept-2"],
    });
    assert.equal(multi.allowed, true);

    const emptyDepts = decideTaskCreation({
      requesterRole: role,
      scope: "departments",
      departmentIds: [],
    });
    assert.equal(emptyDepts.allowed, false);
    assert.equal(emptyDepts.reason, "missing_departments");

    const all = decideTaskCreation({
      requesterRole: role,
      scope: "all",
    });
    assert.equal(all.allowed, false);
    assert.equal(all.reason, "role_not_allowed");
  }
});

test("إنشاء المهام: SUPER_ADMIN يمكنه إنشاء مهمة لجميع الأقسام", () => {
  const result = decideTaskCreation({
    requesterRole: "SUPER_ADMIN",
    scope: "all",
  });
  assert.equal(result.allowed, true);
});

// ==========================================
// 2. اختبارات اعتماد ورفض الساعات (decideHoursReview)
// ==========================================

test("مراجعة الساعات: لا أحد يعتمد ساعاته بنفسه إطلاقاً", () => {
  const roles = ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"] as const;

  for (const role of roles) {
    const result = decideHoursReview({
      reviewerRole: role,
      reviewerId: "user-99",
      reviewerDepartmentId: "dept-1",
      ownerRole: role,
      ownerId: "user-99",
      ownerDepartmentId: "dept-1",
      currentStatus: "pending",
      action: "approve",
      submittedHours: 4,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "self_review");
  }
});

test("مراجعة الساعات: رئيس قسم لا يعتمد ساعات قسم آخر (مرفوض)", () => {
  const result = decideHoursReview({
    reviewerRole: "DEPARTMENT_HEAD",
    reviewerId: "head-1",
    reviewerDepartmentId: "dept-A",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    ownerDepartmentId: "dept-B",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 3,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "department_mismatch");
});

test("مراجعة الساعات: رئيس قسم يعتمد ساعات أعضاء نفس القسم", () => {
  const result = decideHoursReview({
    reviewerRole: "DEPARTMENT_HEAD",
    reviewerId: "head-1",
    reviewerDepartmentId: "dept-A",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    ownerDepartmentId: "dept-A",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 3,
  });
  assert.equal(result.allowed, true);
});

test("مراجعة الساعات: ساعات رئيس القسم يعتمدها HR أو ADMIN أو SUPER_ADMIN فقط", () => {
  const allowedReviewers = ["HR", "ADMIN", "SUPER_ADMIN"] as const;
  for (const reviewerRole of allowedReviewers) {
    const res = decideHoursReview({
      reviewerRole,
      reviewerId: "rev-1",
      ownerRole: "DEPARTMENT_HEAD",
      ownerId: "head-1",
      currentStatus: "pending",
      action: "approve",
      submittedHours: 4,
    });
    assert.equal(res.allowed, true);
  }

  const headReviewingHead = decideHoursReview({
    reviewerRole: "DEPARTMENT_HEAD",
    reviewerId: "head-2",
    ownerRole: "DEPARTMENT_HEAD",
    ownerId: "head-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 4,
  });
  assert.equal(headReviewingHead.allowed, false);
  assert.equal(headReviewingHead.reason, "role_not_allowed");
});

test("مراجعة الساعات: HR لا يعتمد ساعات ADMIN (مرفوض؛ SUPER_ADMIN فقط)", () => {
  const hrReviewAdmin = decideHoursReview({
    reviewerRole: "HR",
    reviewerId: "hr-1",
    ownerRole: "ADMIN",
    ownerId: "admin-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 5,
  });
  assert.equal(hrReviewAdmin.allowed, false);
  assert.equal(hrReviewAdmin.reason, "role_not_allowed");

  const adminReviewHr = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "HR",
    ownerId: "hr-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 5,
  });
  assert.equal(adminReviewHr.allowed, false);
  assert.equal(adminReviewHr.reason, "role_not_allowed");

  const superAdminReview = decideHoursReview({
    reviewerRole: "SUPER_ADMIN",
    reviewerId: "super-1",
    ownerRole: "ADMIN",
    ownerId: "admin-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 5,
  });
  assert.equal(superAdminReview.allowed, true);
});

test("مراجعة الساعات: ساعات SUPER_ADMIN يعتمدها SUPER_ADMIN آخر فقط", () => {
  const anotherSuper = decideHoursReview({
    reviewerRole: "SUPER_ADMIN",
    reviewerId: "super-2",
    ownerRole: "SUPER_ADMIN",
    ownerId: "super-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 2,
  });
  assert.equal(anotherSuper.allowed, true);

  const adminReviewSuper = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "SUPER_ADMIN",
    ownerId: "super-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 2,
  });
  assert.equal(adminReviewSuper.allowed, false);
  assert.equal(adminReviewSuper.reason, "role_not_allowed");
});

test("مراجعة الساعات: اعتماد أكثر أو أقل من المقدّم بدون ملاحظة يُرفض", () => {
  const moreWithoutNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 4,
    approvedHours: 5,
    note: "",
  });
  assert.equal(moreWithoutNote.allowed, false);
  assert.equal(moreWithoutNote.reason, "missing_note");

  const lessWithoutNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 4,
    approvedHours: 3,
    note: "   ",
  });
  assert.equal(lessWithoutNote.allowed, false);
  assert.equal(lessWithoutNote.reason, "missing_note");

  const withNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "pending",
    action: "approve",
    submittedHours: 4,
    approvedHours: 5,
    note: "تم تمديد فترة العمل الميداني",
  });
  assert.equal(withNote.allowed, true);
});

test("مراجعة الساعات: الرفض بدون سبب يُرفض", () => {
  const rejectWithoutNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "pending",
    action: "reject",
    submittedHours: 4,
    note: "",
  });
  assert.equal(rejectWithoutNote.allowed, false);
  assert.equal(rejectWithoutNote.reason, "missing_note");

  const rejectWithNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "pending",
    action: "reject",
    submittedHours: 4,
    note: "المهمة غير مطابقة للوصف",
  });
  assert.equal(rejectWithNote.allowed, true);
});

test("مراجعة الساعات: تعديل ساعات معتمدة سابقاً يتطلب ملاحظة إجبارية", () => {
  const withoutNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "approved",
    action: "approve",
    submittedHours: 4,
    approvedHours: 4,
    note: "",
  });
  assert.equal(withoutNote.allowed, false);
  assert.equal(withoutNote.reason, "missing_note");

  const withNote = decideHoursReview({
    reviewerRole: "ADMIN",
    reviewerId: "admin-1",
    ownerRole: "VOLUNTEER",
    ownerId: "vol-1",
    currentStatus: "approved",
    action: "approve",
    submittedHours: 4,
    approvedHours: 3.5,
    note: "تصحيح احتساب فترة الاستراحة",
  });
  assert.equal(withNote.allowed, true);
});

// ==========================================
// 3. اختبارات resolveInitialHoursStatus
// ==========================================

test("الحالة الأولية للساعات: SUPER_ADMIN الوحيد يُعتمد تلقائياً", () => {
  const soleSuper = resolveInitialHoursStatus({
    ownerRole: "SUPER_ADMIN",
    hasOtherActiveSuperAdmin: false,
  });
  assert.equal(soleSuper.status, "approved");
  assert.equal(soleSuper.autoApproved, true);

  const superWithOther = resolveInitialHoursStatus({
    ownerRole: "SUPER_ADMIN",
    hasOtherActiveSuperAdmin: true,
  });
  assert.equal(superWithOther.status, "pending");

  const volunteer = resolveInitialHoursStatus({
    ownerRole: "VOLUNTEER",
    hasOtherActiveSuperAdmin: false,
  });
  assert.equal(volunteer.status, "pending");
});

// ==========================================
// 4. اختبارات validateHoursSubmission
// ==========================================

test("التحقق من إدخال الساعات: 24.5 ساعة وقيم غير مضاعفة لـ 0.25 تُرفض", () => {
  const today = new Date().toISOString().split("T")[0];

  const overMax = validateHoursSubmission({
    hours: 24.5,
    workDate: today,
  });
  assert.equal(overMax.valid, false);
  assert.equal(overMax.reason, "invalid_hours");

  const invalidStep = validateHoursSubmission({
    hours: 2.3,
    workDate: today,
  });
  assert.equal(invalidStep.valid, false);
  assert.equal(invalidStep.reason, "invalid_hours");

  const zeroHours = validateHoursSubmission({
    hours: 0,
    workDate: today,
  });
  assert.equal(zeroHours.valid, false);

  const validQuarter = validateHoursSubmission({
    hours: 0.25,
    workDate: today,
  });
  assert.equal(validQuarter.valid, true);

  const validFull = validateHoursSubmission({
    hours: 24,
    workDate: today,
    note: "عمل يوم كامل",
  });
  assert.equal(validFull.valid, true);
});

test("التحقق من إدخال الساعات: تاريخ مستقبلي يُرفض", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");
  const tomorrow = "2026-10-14";

  const future = validateHoursSubmission({
    hours: 3,
    workDate: tomorrow,
    now,
  });
  assert.equal(future.valid, false);
  assert.equal(future.reason, "future_date");

  const sameDay = validateHoursSubmission({
    hours: 3,
    workDate: "2026-10-13",
    now,
  });
  assert.equal(sameDay.valid, true);
});

test("التحقق من إدخال الساعات: تجاوز 12 ساعة في اليوم الواحد يتطلب ملاحظة", () => {
  const today = "2026-10-13";
  const now = new Date("2026-10-13T12:00:00.000Z");

  const over12WithoutNote = validateHoursSubmission({
    hours: 8,
    workDate: today,
    otherHoursSameDay: 5, // المجموع 13
    note: "",
    now,
  });
  assert.equal(over12WithoutNote.valid, false);
  assert.equal(over12WithoutNote.needsNote, true);
  assert.equal(over12WithoutNote.reason, "note_required");

  const over12WithNote = validateHoursSubmission({
    hours: 8,
    workDate: today,
    otherHoursSameDay: 5,
    note: "تغطية فعالية إضافية في المساء",
    now,
  });
  assert.equal(over12WithNote.valid, true);
  assert.equal(over12WithNote.needsNote, true);
});

// ==========================================
// 5. اختبارات canEditOwnEntry
// ==========================================

test("تعديل الساعات للمالك: مسموح في pending و rejected وممنوع في approved أو لغير المالك", () => {
  assert.equal(canEditOwnEntry({ status: "pending", isOwner: true }), true);
  assert.equal(canEditOwnEntry({ status: "rejected", isOwner: true }), true);
  assert.equal(canEditOwnEntry({ status: "approved", isOwner: true }), false);
  assert.equal(canEditOwnEntry({ status: "pending", isOwner: false }), false);
});

// ==========================================
// 6. اختبارات توقيت Asia/Riyadh في validateHoursSubmission
// ==========================================

test("التحقق من التاريخ: now=2026-10-15T22:30Z → 2026-10-16 هو اليوم بتوقيت الرياض → مقبول", () => {
  // 2026-10-15T22:30Z = 2026-10-16T01:30+03:00 ← اليوم بتوقيت الرياض هو 2026-10-16
  const now = new Date("2026-10-15T22:30:00Z");

  const sameDay = validateHoursSubmission({
    hours: 3,
    workDate: "2026-10-16",
    now,
  });
  assert.equal(
    sameDay.valid,
    true,
    "2026-10-16 يجب أن يكون مقبولاً — هو اليوم بتوقيت الرياض"
  );
});

test("التحقق من التاريخ: now=2026-10-15T22:30Z → 2026-10-17 مستقبلي بتوقيت الرياض → مرفوض", () => {
  const now = new Date("2026-10-15T22:30:00Z");

  const future = validateHoursSubmission({
    hours: 3,
    workDate: "2026-10-17",
    now,
  });
  assert.equal(
    future.valid,
    false,
    "2026-10-17 يجب أن يُرفض — مستقبلي بتوقيت الرياض"
  );
  assert.equal(future.reason, "future_date");
});

test("التحقق من التاريخ: صيغة خاطئة مثل 'not-a-date' لا تجتاز التحقق (valid=false)", () => {
  // route.ts تمنع الصيغ الخاطئة قبل الوصول للدالة، لكن الدالة تتعامل معها بأمان:
  // "not-a-date" > أي تاريخ YYYY-MM-DD منطقياً في مقارنة السلاسل → future_date
  // أو قد تساوي سلسلة أكبر — المهم أن valid يكون false دائماً.
  const now = new Date("2026-10-15T22:30:00Z");

  const malformed = validateHoursSubmission({
    hours: 3,
    workDate: "not-a-date",
    now,
  });
  assert.equal(
    malformed.valid,
    false,
    "صيغة تاريخ خاطئة يجب ألا تجتاز التحقق أبداً"
  );
});
