import type { CertificateRequestType } from "./supabase/dto";

export const VOLUNTEER_MIN_HOURS = 40;
export const EXPERTISE_MIN_HOURS = 300;
export const PARTICIPATION_MIN_TASKS = 1;

export type CertificateEligibilityInput = {
  type: CertificateRequestType;
  userStatus?: string | null;
  approvedHours: number;
  completedTasksCount: number;
};

export type CertificateEligibilityResult = {
  isEligible: boolean;
  reason?: string;
  progressText?: string;
};

/**
 * التحقق النقي من أهلية استحقاق الشهادة بناءً على الشروط المحددة:
 * - شهادة التطوع: 40 ساعة معتمدة كحد أدنى.
 * - شهادة الخبرة: 300 ساعة معتمدة كحد أدنى.
 * - شهادة المشاركة: إكمال مهمة واحدة على الأقل بنجاح وحساب نشط.
 */
export function checkCertificateEligibility(
  input: CertificateEligibilityInput
): CertificateEligibilityResult {
  const { type, userStatus, approvedHours, completedTasksCount } = input;

  if (userStatus && userStatus !== "active") {
    return {
      isEligible: false,
      reason: "حسابك غير نشط، لا يمكنك التقديم على الشهادات حالياً.",
    };
  }

  switch (type) {
    case "volunteer": {
      const isEligible = approvedHours >= VOLUNTEER_MIN_HOURS;
      return {
        isEligible,
        reason: isEligible
          ? undefined
          : `شهادة التطوع تتطلب إكمال ${VOLUNTEER_MIN_HOURS} ساعة معتمدة كحد أدنى. ساعاتك الحالية: ${approvedHours} ساعة.`,
        progressText: `${approvedHours} / ${VOLUNTEER_MIN_HOURS} ساعة`,
      };
    }
    case "expertise": {
      const isEligible = approvedHours >= EXPERTISE_MIN_HOURS;
      return {
        isEligible,
        reason: isEligible
          ? undefined
          : `شهادة الخبرة تتطلب إكمال ${EXPERTISE_MIN_HOURS} ساعة معتمدة كحد أدنى. ساعاتك الحالية: ${approvedHours} ساعة.`,
        progressText: `${approvedHours} / ${EXPERTISE_MIN_HOURS} ساعة`,
      };
    }
    case "participation": {
      const isEligible = completedTasksCount >= PARTICIPATION_MIN_TASKS;
      return {
        isEligible,
        reason: isEligible
          ? undefined
          : `شهادة المشاركة تتطلب إكمال مهمة واحدة على الأقل بنجاح. مهامك المكتملة حالياً: ${completedTasksCount}.`,
        progressText: `${completedTasksCount} / ${PARTICIPATION_MIN_TASKS} مهمة مكتملة`,
      };
    }
    case "recommendation_letter": {
      return {
        isEligible: true,
      };
    }
    default:
      return {
        isEligible: false,
        reason: "نوع الشهادة غير معروف.",
      };
  }
}

export type TaskSummaryItem = {
  id?: string | number;
  status: string;
  assigned_to?: string | null;
  target_user_id?: string | null;
  created_by?: string | null;
};

export type HoursSummaryItem = {
  id?: string | number;
  task_id?: string | null;
  status?: string | null;
};

/**
 * دالة نقية لحساب عدد المهام المكتملة للمستخدم من جدول المهام وسجلات الساعات المعتمدة.
 */
export function countUserCompletedTasks(params: {
  userId: string;
  tasks?: TaskSummaryItem[] | null;
  approvedHoursLogs?: HoursSummaryItem[] | null;
}): number {
  const { userId, tasks, approvedHoursLogs } = params;
  let count = 0;
  const countedTaskIds = new Set<string>();

  if (Array.isArray(tasks)) {
    for (const task of tasks) {
      if (task.status === "completed") {
        if (
          task.assigned_to === userId ||
          task.target_user_id === userId ||
          task.created_by === userId
        ) {
          count++;
          if (task.id !== undefined && task.id !== null) {
            countedTaskIds.add(String(task.id));
          }
        }
      }
    }
  }

  // إضافة أي سجلات ساعات معتمدة مرتبطة بمهمة لم تُحسب مسبقاً
  if (Array.isArray(approvedHoursLogs)) {
    for (const h of approvedHoursLogs) {
      if (h.task_id && (h.status === "approved" || !h.status)) {
        const taskIdStr = String(h.task_id);
        if (!countedTaskIds.has(taskIdStr)) {
          count++;
          countedTaskIds.add(taskIdStr);
        }
      }
    }
  }

  return count;
}
