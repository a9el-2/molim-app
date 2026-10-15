/**
 * دوال نقية لبناء حمولات جداول hours_logs و audit_logs.
 * تضمن عدم الثقة بأي قيم حساسة قادمة من العميل (مثل user_id, status, department_id)،
 * وتطبيق قيم الخادم الموثوقة حصراً.
 */

export type HoursDbStatus = "in_review" | "approved" | "rejected";

export type BuildHoursInsertInput = {
  hours: number | unknown;
  workDate: string | unknown;
  description?: string | unknown;
  taskId?: string | null | unknown;
  [key: string]: unknown;
};

export type ServerHoursContext = {
  userId: string;
  departmentId: string | null;
  status: HoursDbStatus;
  approvedHours: number | null;
  isSelfApproved: boolean;
};

export type HoursInsertPayload = {
  user_id: string;
  department_id: string | null;
  task_id: string | null;
  submitted_hours: number;
  approved_hours: number | null;
  date: string;
  description: string;
  status: HoursDbStatus;
  is_self_approved: boolean;
  reviewed_by: null;
  reviewed_at: null;
  review_notes: null;
};

/**
 * بناء حمولة إنشاء سجل ساعات جديد.
 * تتجاهل أي قيم حساسة أو رتبة أو دور أو معرف مستخدم أو حالة قادمة من العميل.
 */
export function buildHoursInsertPayload(
  input: BuildHoursInsertInput,
  context: ServerHoursContext
): HoursInsertPayload {
  const hours =
    typeof input.hours === "number" ? input.hours : Number(input.hours);
  const date =
    typeof input.workDate === "string" ? input.workDate.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const taskId =
    typeof input.taskId === "string" && input.taskId.trim()
      ? input.taskId.trim()
      : null;

  return {
    user_id: context.userId,
    department_id: context.departmentId,
    task_id: taskId,
    submitted_hours: hours,
    approved_hours: context.approvedHours,
    date,
    description,
    status: context.status,
    is_self_approved: context.isSelfApproved,
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
  };
}

export type BuildHoursUpdateInput = {
  hours?: number | unknown;
  workDate?: string | unknown;
  description?: string | unknown;
  taskId?: string | null | unknown;
  [key: string]: unknown;
};

export type ExistingHoursRecord = {
  submitted_hours: number;
  date: string;
  description: string;
  task_id: string | null;
};

export type HoursUpdatePayload = {
  submitted_hours: number;
  date: string;
  description: string;
  task_id: string | null;
  status: "in_review";
  approved_hours: null;
  reviewed_by: null;
  reviewed_at: null;
  review_notes: null;
  is_self_approved: false;
  updated_at: string;
};

/**
 * بناء حمولة تعديل سجل ساعات قائم من قبل صاحبه.
 * تعيد الحالة تلقائياً إلى in_review وتفرغ حقول المراجعة والاعتماد،
 * وتتجاهل أي محاولة من العميل لتمرير status أو approved_hours.
 */
export function buildHoursUpdatePayload(
  input: BuildHoursUpdateInput,
  existing: ExistingHoursRecord
): HoursUpdatePayload {
  const hours =
    input.hours !== undefined
      ? (typeof input.hours === "number" ? input.hours : Number(input.hours))
      : existing.submitted_hours;

  const date =
    typeof input.workDate === "string" && input.workDate.trim()
      ? input.workDate.trim()
      : existing.date;

  const description =
    typeof input.description === "string"
      ? input.description.trim()
      : existing.description;

  const taskId =
    input.taskId !== undefined
      ? (typeof input.taskId === "string" && input.taskId.trim()
          ? input.taskId.trim()
          : null)
      : existing.task_id;

  return {
    submitted_hours: hours,
    date,
    description,
    task_id: taskId,
    status: "in_review",
    approved_hours: null,
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    is_self_approved: false,
    updated_at: new Date().toISOString(),
  };
}

export type HoursPolicyStatus = "pending" | "approved" | "rejected";

/**
 * تحويل حالة الساعات من صيغة قاعدة البيانات (in_review, approved, rejected)
 * إلى صيغة سياسة النظام (pending, approved, rejected).
 */
export function toPolicyStatus(dbStatus: string | null | undefined): HoursPolicyStatus {
  if (dbStatus === "in_review") return "pending";
  if (dbStatus === "approved") return "approved";
  if (dbStatus === "rejected") return "rejected";
  return "pending";
}

/**
 * تحويل حالة الساعات من صيغة سياسة النظام (pending, approved, rejected)
 * إلى صيغة قاعدة البيانات (in_review, approved, rejected).
 */
export function toDbStatus(policyStatus: string | null | undefined): HoursDbStatus {
  if (policyStatus === "pending") return "in_review";
  if (policyStatus === "approved") return "approved";
  if (policyStatus === "rejected") return "rejected";
  return "in_review";
}

export type BuildHoursReviewInput = {
  action: "approve" | "reject";
  submittedHours: number;
  approvedHours?: number | null | undefined;
  note?: string | null | undefined;
  reviewerId: string;
  reviewedAt?: string;
};

export type HoursReviewPayload = {
  status: "approved" | "rejected";
  approved_hours: number | null;
  reviewed_by: string;
  reviewed_at: string;
  review_notes: string | null;
  updated_at: string;
};

/**
 * بناء حمولة مراجعة الساعات (اعتماد أو رفض) لتحديث جدول hours_logs.
 * - عند الاعتماد: status=approved، approved_hours، reviewed_by، reviewed_at، review_notes.
 * - عند الرفض: status=rejected، approved_hours=null، review_notes إجباري.
 * - لا تمس submitted_hours ولا is_self_approved.
 */
export function buildHoursReviewPayload(
  input: BuildHoursReviewInput
): HoursReviewPayload {
  const timestamp = input.reviewedAt ?? new Date().toISOString();
  const notes = typeof input.note === "string" ? input.note.trim() : null;

  if (input.action === "reject") {
    return {
      status: "rejected",
      approved_hours: null,
      reviewed_by: input.reviewerId,
      reviewed_at: timestamp,
      review_notes: notes || null,
      updated_at: timestamp,
    };
  }

  const finalApprovedHours =
    input.approvedHours !== undefined && input.approvedHours !== null
      ? Number(input.approvedHours)
      : input.submittedHours;

  return {
    status: "approved",
    approved_hours: finalApprovedHours,
    reviewed_by: input.reviewerId,
    reviewed_at: timestamp,
    review_notes: notes || null,
    updated_at: timestamp,
  };
}

export type AuditAction =
  | "submit_hours"
  | "edit_hours"
  | "self_approve_hours"
  | "approve_hours"
  | "reject_hours";

export type BuildAuditLogInput = {
  actorId: string;
  action: AuditAction;
  targetId: string;
  targetUserId: string;
  departmentId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown>;
  details?: string | null;
};

export type AuditLogInsertPayload = {
  actor_id: string;
  category: "hours";
  action: AuditAction;
  target_type: "hours_logs";
  target_id: string;
  target_user_id: string;
  department_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  details: string | null;
};

/**
 * بناء حمولة سجل التدقيق في audit_logs.
 */
export function buildAuditLogPayload(
  input: BuildAuditLogInput
): AuditLogInsertPayload {
  return {
    actor_id: input.actorId,
    category: "hours",
    action: input.action,
    target_type: "hours_logs",
    target_id: input.targetId,
    target_user_id: input.targetUserId,
    department_id: input.departmentId,
    before_data: input.beforeData,
    after_data: input.afterData,
    details: input.details ?? null,
  };
}
