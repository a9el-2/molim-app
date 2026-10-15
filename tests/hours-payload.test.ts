import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildHoursInsertPayload,
  buildHoursUpdatePayload,
  buildHoursReviewPayload,
  buildAuditLogPayload,
  toPolicyStatus,
  toDbStatus,
} from "../src/app/lib/hours-payload.ts";

test("بناء حمولة الإدخال: تجاهل أي قيم حساسة أو مشبوهة من العميل والالتزام بقيم الخادم", () => {
  const maliciousClientInput = {
    hours: 4.5,
    workDate: "2026-10-15",
    description: "إعداد تقرير المتطوعين",
    taskId: "task-100",
    // قيم حساسة يحاول العميل حقنها:
    user_id: "attacker-user-id",
    department_id: "dept-fake",
    status: "approved",
    approved_hours: 12,
    approvedHours: 12,
    is_self_approved: true,
    reviewed_by: "fake-reviewer",
    reviewed_at: "2026-10-15",
    review_notes: "fake review",
  };

  const trustedServerContext = {
    userId: "MOL-00015",
    departmentId: "dept-research-01",
    status: "in_review" as const,
    approvedHours: null,
    isSelfApproved: false,
  };

  const payload = buildHoursInsertPayload(
    maliciousClientInput,
    trustedServerContext
  );

  // القيم الأساسية الصحيحة
  assert.equal(payload.user_id, "MOL-00015");
  assert.equal(payload.department_id, "dept-research-01");
  assert.equal(payload.status, "in_review");
  assert.equal(payload.approved_hours, null);
  assert.equal(payload.is_self_approved, false);
  assert.equal(payload.submitted_hours, 4.5);
  assert.equal(payload.date, "2026-10-15");
  assert.equal(payload.description, "إعداد تقرير المتطوعين");
  assert.equal(payload.task_id, "task-100");

  // حقول المراجعة يجب أن تكون مفرغة تماماً عند التقديم
  assert.equal(payload.reviewed_by, null);
  assert.equal(payload.reviewed_at, null);
  assert.equal(payload.review_notes, null);
});

test("بناء حمولة الإدخال: دعم حالة الاعتماد الذاتي للرئيس العام الوحيد", () => {
  const input = {
    hours: 3.25,
    workDate: "2026-10-14",
    description: "متابعة أعمال المنصة",
  };

  const superAdminContext = {
    userId: "MOL-00001",
    departmentId: "dept-general",
    status: "approved" as const,
    approvedHours: 3.25,
    isSelfApproved: true,
  };

  const payload = buildHoursInsertPayload(input, superAdminContext);

  assert.equal(payload.user_id, "MOL-00001");
  assert.equal(payload.status, "approved");
  assert.equal(payload.approved_hours, 3.25);
  assert.equal(payload.is_self_approved, true);
  assert.equal(payload.task_id, null);
});

test("بناء حمولة التعديل: يعيد الحالة دائماً إلى in_review ويفرغ حقول المراجعة والاعتماد", () => {
  const existingRecord = {
    submitted_hours: 4,
    date: "2026-10-10",
    description: "وصف سابق",
    task_id: "task-01",
  };

  const clientAttempt = {
    hours: 5,
    description: "وصف معدل",
    // محاولات العميل لتثبيت الاعتماد
    status: "approved",
    approved_hours: 5,
    is_self_approved: true,
    reviewed_by: "hacked",
    review_notes: "auto accepted",
  };

  const updatePayload = buildHoursUpdatePayload(clientAttempt, existingRecord);

  assert.equal(updatePayload.submitted_hours, 5);
  assert.equal(updatePayload.description, "وصف معدل");
  assert.equal(updatePayload.date, "2026-10-10"); // استبقى التاريخ الأصلي
  assert.equal(updatePayload.task_id, "task-01"); // استبقى المهمة الأصلية
  assert.equal(updatePayload.status, "in_review");
  assert.equal(updatePayload.approved_hours, null);
  assert.equal(updatePayload.reviewed_by, null);
  assert.equal(updatePayload.reviewed_at, null);
  assert.equal(updatePayload.review_notes, null);
  assert.equal(updatePayload.is_self_approved, false);
  assert.ok(updatePayload.updated_at);
});

test("سجل التدقيق: بناء حمولة صحيحة لإجراء submit_hours", () => {
  const audit = buildAuditLogPayload({
    actorId: "user-123",
    action: "submit_hours",
    targetId: "hour-999",
    targetUserId: "user-123",
    departmentId: "dept-1",
    beforeData: null,
    afterData: { id: "hour-999", submitted_hours: 3 },
    details: "تسجيل ساعات جديدة",
  });

  assert.equal(audit.actor_id, "user-123");
  assert.equal(audit.category, "hours");
  assert.equal(audit.action, "submit_hours");
  assert.equal(audit.target_type, "hours_logs");
  assert.equal(audit.target_id, "hour-999");
  assert.equal(audit.target_user_id, "user-123");
  assert.equal(audit.department_id, "dept-1");
  assert.equal(audit.before_data, null);
  assert.deepEqual(audit.after_data, { id: "hour-999", submitted_hours: 3 });
});

test("سجل التدقيق: بناء حمولة صحيحة لإجراء edit_hours مع before_data و after_data", () => {
  const before = { id: "hour-55", submitted_hours: 2, status: "rejected" };
  const after = { id: "hour-55", submitted_hours: 3, status: "in_review" };

  const audit = buildAuditLogPayload({
    actorId: "user-456",
    action: "edit_hours",
    targetId: "hour-55",
    targetUserId: "user-456",
    departmentId: null,
    beforeData: before,
    afterData: after,
    details: "تعديل ساعات وإعادة إرسال",
  });

  assert.equal(audit.action, "edit_hours");
  assert.equal(audit.before_data, before);
  assert.equal(audit.after_data, after);
  assert.equal(audit.department_id, null);
});

test("سجل التدقيق: بناء حمولة صحيحة للإجراء self_approve_hours", () => {
  const after = { id: "hour-77", submitted_hours: 6, status: "approved", is_self_approved: true };

  const audit = buildAuditLogPayload({
    actorId: "super-1",
    action: "self_approve_hours",
    targetId: "hour-77",
    targetUserId: "super-1",
    departmentId: "dept-admin",
    beforeData: null,
    afterData: after,
  });

  assert.equal(audit.action, "self_approve_hours");
  assert.equal(audit.details, null);
  assert.equal(audit.after_data.is_self_approved, true);
});

// ==========================================
// اختبارات التحويل بين حالات القاعدة والسياسة
// ==========================================

test("تحويل الحالة: toPolicyStatus يحول in_review إلى pending ويحافظ على approved و rejected", () => {
  assert.equal(toPolicyStatus("in_review"), "pending");
  assert.equal(toPolicyStatus("approved"), "approved");
  assert.equal(toPolicyStatus("rejected"), "rejected");
  assert.equal(toPolicyStatus("unknown"), "pending");
  assert.equal(toPolicyStatus(null), "pending");
  assert.equal(toPolicyStatus(undefined), "pending");
});

test("تحويل الحالة: toDbStatus يحول pending إلى in_review ويحافظ على approved و rejected", () => {
  assert.equal(toDbStatus("pending"), "in_review");
  assert.equal(toDbStatus("approved"), "approved");
  assert.equal(toDbStatus("rejected"), "rejected");
  assert.equal(toDbStatus("unknown"), "in_review");
  assert.equal(toDbStatus(null), "in_review");
  assert.equal(toDbStatus(undefined), "in_review");
});

// ==========================================
// اختبارات بناء حمولة مراجعة الساعات (buildHoursReviewPayload)
// ==========================================

test("بناء حمولة المراجعة: اعتماد الساعات بنفس عدد الساعات المقدمة بدون تعديل", () => {
  const payload = buildHoursReviewPayload({
    action: "approve",
    submittedHours: 4,
    reviewerId: "reviewer-1",
    reviewedAt: "2026-10-15T12:00:00.000Z",
  });

  assert.equal(payload.status, "approved");
  assert.equal(payload.approved_hours, 4);
  assert.equal(payload.reviewed_by, "reviewer-1");
  assert.equal(payload.reviewed_at, "2026-10-15T12:00:00.000Z");
  assert.equal(payload.review_notes, null);
  assert.ok(payload.updated_at);
});

test("بناء حمولة المراجعة: اعتماد الساعات مع تعديل عدد الساعات المعتمدة وملاحظة", () => {
  const payload = buildHoursReviewPayload({
    action: "approve",
    submittedHours: 5,
    approvedHours: 3.5,
    note: "تم استبعاد ساعة الاستراحة",
    reviewerId: "admin-99",
  });

  assert.equal(payload.status, "approved");
  assert.equal(payload.approved_hours, 3.5);
  assert.equal(payload.reviewed_by, "admin-99");
  assert.equal(payload.review_notes, "تم استبعاد ساعة الاستراحة");
});

test("بناء حمولة المراجعة: رفض الساعات يفرغ approved_hours ويحفظ الملاحظة الإجبارية", () => {
  const payload = buildHoursReviewPayload({
    action: "reject",
    submittedHours: 6,
    approvedHours: 6, // يجب تجاهلها عند الرفض
    note: "المهمة غير مكتملة ولم تسلم المخرجات",
    reviewerId: "hr-01",
    reviewedAt: "2026-10-15T14:30:00.000Z",
  });

  assert.equal(payload.status, "rejected");
  assert.equal(payload.approved_hours, null);
  assert.equal(payload.reviewed_by, "hr-01");
  assert.equal(payload.reviewed_at, "2026-10-15T14:30:00.000Z");
  assert.equal(payload.review_notes, "المهمة غير مكتملة ولم تسلم المخرجات");
});

// ==========================================
// اختبارات سجل التدقيق لإجراءات المراجعة
// ==========================================

test("سجل التدقيق: بناء حمولة صحيحة لإجراء approve_hours و reject_hours", () => {
  const approveAudit = buildAuditLogPayload({
    actorId: "rev-1",
    action: "approve_hours",
    targetId: "hour-10",
    targetUserId: "vol-2",
    departmentId: "dept-media",
    beforeData: { status: "in_review", submitted_hours: 4 },
    afterData: { status: "approved", approved_hours: 4 },
    details: "اعتماد الساعات",
  });

  assert.equal(approveAudit.action, "approve_hours");
  assert.equal(approveAudit.actor_id, "rev-1");
  assert.equal(approveAudit.target_user_id, "vol-2");
  assert.equal(approveAudit.category, "hours");

  const rejectAudit = buildAuditLogPayload({
    actorId: "rev-2",
    action: "reject_hours",
    targetId: "hour-11",
    targetUserId: "vol-3",
    departmentId: "dept-research",
    beforeData: { status: "in_review", submitted_hours: 5 },
    afterData: { status: "rejected", approved_hours: null },
    details: "رفض الساعات",
  });

  assert.equal(rejectAudit.action, "reject_hours");
  assert.equal(rejectAudit.actor_id, "rev-2");
  assert.equal(rejectAudit.target_user_id, "vol-3");
});
