import type { UserRole } from "./roles.ts";

/**
 * نطاق إنشاء المهمة:
 * - self: للمتطوع أو العضو نفسه فقط
 * - own_department: لقسم المنشئ
 * - departments: لأقسام محددة
 * - all: مهمة عامة لجميع الأقسام
 */
export type TaskScope = "self" | "own_department" | "departments" | "all";

export type TaskCreationDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string };

/**
 * التحقق من صلاحية إنشاء مهمة:
 * - المتطوع: لنفسه فقط.
 * - رئيس القسم: لنفسه أو لقسمه كاملاً.
 * - HR و ADMIN: لأنفسهم أو لقسم أو عدة أقسام.
 * - SUPER_ADMIN: كل ذلك وكل الأقسام.
 */
export function decideTaskCreation(input: {
  requesterRole: UserRole | null | undefined;
  requesterDepartmentId?: string | null | undefined;
  scope: TaskScope;
  departmentIds?: string[] | null | undefined;
}): TaskCreationDecision {
  const { requesterRole, requesterDepartmentId, scope, departmentIds } = input;

  if (!requesterRole) {
    return {
      allowed: false,
      reason: "unauthorized",
      message: "الرتبة غير محددة.",
    };
  }

  // إنشاء المهمة للنفس متاح لجميع الرتب
  if (scope === "self") {
    return { allowed: true };
  }

  // نطاق القسم الخاص بالمنشئ
  if (scope === "own_department") {
    if (requesterRole === "VOLUNTEER") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "المتطوع يمكنه إنشاء مهام لنفسه فقط.",
      };
    }

    if (requesterRole === "DEPARTMENT_HEAD" && !requesterDepartmentId) {
      return {
        allowed: false,
        reason: "no_department",
        message: "يجب أن ينتمي رئيس القسم إلى قسم لإنشاء مهمة لقسمه.",
      };
    }

    return { allowed: true };
  }

  // نطاق عدة أقسام محددة
  if (scope === "departments") {
    if (requesterRole === "VOLUNTEER") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "المتطوع يمكنه إنشاء مهام لنفسه فقط.",
      };
    }

    if (requesterRole === "DEPARTMENT_HEAD") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "رئيس القسم يمكنه إنشاء مهام لنفسه أو لقسمه فقط.",
      };
    }

    if (!departmentIds || departmentIds.length === 0) {
      return {
        allowed: false,
        reason: "missing_departments",
        message: "يجب تحديد الأقسام المستهدفة للمهمة.",
      };
    }

    return { allowed: true };
  }

  // نطاق جميع الأقسام محصور بالرئيس العام
  if (scope === "all") {
    if (requesterRole === "SUPER_ADMIN") {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "role_not_allowed",
      message: "إنشاء مهمة عامة لجميع الأقسام محصور بالرئيس العام.",
    };
  }

  return {
    allowed: false,
    reason: "invalid_scope",
    message: "نطاق المهمة غير معروف.",
  };
}

export type HoursReviewAction = "approve" | "reject";

export type HoursReviewDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string };

/**
 * التحقق من صلاحية مراجعة الساعات (اعتماد أو رفض):
 * - لا أحد يعتمد أو يراجع ساعاته بنفسه إطلاقاً.
 * - ساعات المتطوع: يعتمدها رئيس قسمه (نفس القسم فقط) أو HR أو ADMIN أو SUPER_ADMIN.
 * - ساعات رئيس القسم: يعتمدها HR أو ADMIN أو SUPER_ADMIN.
 * - ساعات HR و ADMIN: يعتمدها SUPER_ADMIN فقط.
 * - ساعات SUPER_ADMIN: يعتمدها SUPER_ADMIN آخر.
 * - الحالة المسموحة للاعتماد: pending أو approved (تعديل لاحق).
 * - الحالة المسموحة للرفض: pending فقط مع سبب إجباري.
 * - المعتمد حر في تعديل الساعات (0.25 إلى 24)، وإن اختلفت عن المقدم فالسبب إجباري.
 * - تعديل ساعات معتمدة سابقاً يتطلب سبباً إجبارياً.
 */
export function decideHoursReview(input: {
  reviewerRole: UserRole | null | undefined;
  reviewerId: string | null | undefined;
  reviewerDepartmentId?: string | null | undefined;
  ownerRole: UserRole | null | undefined;
  ownerId: string | null | undefined;
  ownerDepartmentId?: string | null | undefined;
  currentStatus: string;
  action: HoursReviewAction;
  submittedHours: number;
  approvedHours?: number;
  note?: string | null | undefined;
  hasOtherActiveSuperAdmin?: boolean;
}): HoursReviewDecision {
  const {
    reviewerRole,
    reviewerId,
    reviewerDepartmentId,
    ownerRole,
    ownerId,
    ownerDepartmentId,
    currentStatus,
    action,
    submittedHours,
    approvedHours,
    note,
  } = input;

  if (!reviewerRole || !reviewerId || !ownerRole || !ownerId) {
    return {
      allowed: false,
      reason: "missing_info",
      message: "بيانات المراجع أو صاحب الساعات غير مكتملة.",
    };
  }

  // لا أحد يعتمد ساعاته بنفسه إطلاقاً
  if (reviewerId === ownerId) {
    return {
      allowed: false,
      reason: "self_review",
      message: "لا يمكن لأي عضو مراجعة أو اعتماد ساعاته بنفسه إطلاقاً.",
    };
  }

  // فحص الحالة الحالية
  if (action === "approve") {
    if (currentStatus !== "pending" && currentStatus !== "approved") {
      return {
        allowed: false,
        reason: "invalid_status",
        message: "الاعتماد مسموح فقط للساعات قيد المراجعة أو المعتمدة سابقاً.",
      };
    }
  } else if (action === "reject") {
    if (currentStatus !== "pending") {
      return {
        allowed: false,
        reason: "invalid_status",
        message: "الرفض متاح فقط للساعات قيد المراجعة (pending).",
      };
    }
  }

  // صلاحية المراجع بحسب رتبة صاحب الساعات
  if (ownerRole === "VOLUNTEER") {
    if (reviewerRole === "VOLUNTEER") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "المتطوع لا يملك صلاحية مراجعة الساعات.",
      };
    }

    if (reviewerRole === "DEPARTMENT_HEAD") {
      if (
        !reviewerDepartmentId ||
        !ownerDepartmentId ||
        reviewerDepartmentId !== ownerDepartmentId
      ) {
        return {
          allowed: false,
          reason: "department_mismatch",
          message: "رئيس القسم يعتمد ساعات أعضاء قسمه فقط.",
        };
      }
    }
    // HR, ADMIN, SUPER_ADMIN مسموح لهم
  } else if (ownerRole === "DEPARTMENT_HEAD") {
    if (reviewerRole === "VOLUNTEER" || reviewerRole === "DEPARTMENT_HEAD") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message:
          "ساعات رئيس القسم يعتمدها مسؤولو الموارد البشرية أو الإدارة العليا أو الرئيس العام فقط.",
      };
    }
  } else if (ownerRole === "HR" || ownerRole === "ADMIN") {
    if (reviewerRole !== "SUPER_ADMIN") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message:
          "ساعات مسؤولي الموارد البشرية والإدارة العليا يعتمدها الرئيس العام فقط.",
      };
    }
  } else if (ownerRole === "SUPER_ADMIN") {
    if (reviewerRole !== "SUPER_ADMIN") {
      return {
        allowed: false,
        reason: "role_not_allowed",
        message: "ساعات الرئيس العام يعتمدها رئيس عام آخر فقط.",
      };
    }
  }

  // قواعد الرفض
  if (action === "reject") {
    if (!note || !note.trim()) {
      return {
        allowed: false,
        reason: "missing_note",
        message: "سبب الرفض إجباري.",
      };
    }

    return { allowed: true };
  }

  // قواعد الاعتماد
  if (action === "approve") {
    const finalApproved = approvedHours !== undefined ? approvedHours : submittedHours;

    if (
      typeof finalApproved !== "number" ||
      Number.isNaN(finalApproved) ||
      finalApproved < 0.25 ||
      finalApproved > 24 ||
      Math.abs(finalApproved * 4 - Math.round(finalApproved * 4)) > 1e-6
    ) {
      return {
        allowed: false,
        reason: "invalid_hours",
        message: "الساعات المعتمدة يجب أن تكون من 0.25 إلى 24 ساعة بخطوات 0.25.",
      };
    }

    // إذا اختلفت الساعات المعتمدة عن المقدمة
    if (finalApproved !== submittedHours) {
      if (!note || !note.trim()) {
        return {
          allowed: false,
          reason: "missing_note",
          message: "يجب كتابة سبب عند تعديل عدد الساعات المعتمدة عن المقدمة.",
        };
      }
    }

    // إذا كان تعديلاً لساعات معتمدة مسبقاً
    if (currentStatus === "approved") {
      if (!note || !note.trim()) {
        return {
          allowed: false,
          reason: "missing_note",
          message: "يجب كتابة سبب لتعديل ساعات معتمدة سابقاً.",
        };
      }
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "invalid_action",
    message: "إجراء المراجعة غير صالح.",
  };
}

export type InitialHoursResolution =
  | { status: "pending"; autoApproved?: false }
  | { status: "approved"; autoApproved: true };

/**
 * تحديد الحالة الأولية للساعات عند التقديم:
 * ساعات SUPER_ADMIN تعتمد تلقائياً وتوسم بـ "اعتماد ذاتي" إذا لم يوجد SUPER_ADMIN آخر نشط.
 */
export function resolveInitialHoursStatus(input: {
  ownerRole: UserRole | null | undefined;
  hasOtherActiveSuperAdmin?: boolean;
}): InitialHoursResolution {
  if (input.ownerRole === "SUPER_ADMIN" && !input.hasOtherActiveSuperAdmin) {
    return { status: "approved", autoApproved: true };
  }

  return { status: "pending" };
}

export type HoursSubmissionValidation = {
  valid: boolean;
  needsNote: boolean;
  reason?: string;
  message?: string;
};

/**
 * التحقق من إدخال الساعات:
 * - من 0.25 إلى 24 ساعة بخطوات 0.25.
 * - بتاريخ غير مستقبلي.
 * - إذا تجاوز مجموع ساعات المتطوع في اليوم 12 ساعة، يلزم تقديم ملاحظة.
 */
export function validateHoursSubmission(input: {
  hours: number;
  workDate: string | Date;
  otherHoursSameDay?: number;
  note?: string | null | undefined;
  now?: Date;
}): HoursSubmissionValidation {
  const { hours, workDate, otherHoursSameDay = 0, note } = input;

  // التحقق من رقم الساعات
  if (
    typeof hours !== "number" ||
    Number.isNaN(hours) ||
    hours < 0.25 ||
    hours > 24 ||
    Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-6
  ) {
    return {
      valid: false,
      needsNote: false,
      reason: "invalid_hours",
      message: "الساعات يجب أن تكون من 0.25 إلى 24 بخطوات 0.25.",
    };
  }

  // التحقق من التاريخ (غير مستقبلي)
  const nowDate = input.now ?? new Date();
  const workDateObj = typeof workDate === "string" ? new Date(workDate) : workDate;

  if (Number.isNaN(workDateObj.getTime())) {
    return {
      valid: false,
      needsNote: false,
      reason: "invalid_date",
      message: "تاريخ العمل غير صالح.",
    };
  }

  const today = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  );
  const workDay = new Date(
    workDateObj.getFullYear(),
    workDateObj.getMonth(),
    workDateObj.getDate()
  );

  if (workDay.getTime() > today.getTime()) {
    return {
      valid: false,
      needsNote: false,
      reason: "future_date",
      message: "لا يمكن تسجيل ساعات بتاريخ مستقبلي.",
    };
  }

  const totalDayHours = hours + otherHoursSameDay;
  const needsNote = totalDayHours > 12;

  if (needsNote && (!note || !note.trim())) {
    return {
      valid: false,
      needsNote: true,
      reason: "note_required",
      message: "يلزم تقديم ملاحظة عند تجاوز مجموع الساعات 12 ساعة في اليوم الواحد.",
    };
  }

  return {
    valid: true,
    needsNote,
  };
}

/**
 * هل يمكن للمالك تعديل السجل وإعادة إرساله:
 * يسمح للمالك بالتعديل والإرسال من جديد عندما تكون الحالة pending أو rejected فقط.
 */
export function canEditOwnEntry(input: {
  status: string | null | undefined;
  isOwner: boolean;
}): boolean {
  if (!input.isOwner) return false;
  return input.status === "pending" || input.status === "rejected";
}
