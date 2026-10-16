/**
 * دوال نقية لبناء حمولات جدول tasks وسجل التدقيق audit_logs الخاص بالمهام،
 * وقواعد الرؤية والتصفية للمهام.
 * تضمن عدم الثقة بأي قيم حساسة قادمة من العميل (مثل created_by, status, target_type, assigned_to).
 */

import type { UserRole } from "./roles.ts";
import type { TaskScope } from "./hours-policy.ts";

export type TaskDbTargetType =
  | "self"
  | "person"
  | "department"
  | "multiple_departments"
  | "all_departments"
  | "upper_management";

export type TaskDbStatus = "in_progress" | "in_review" | "completed" | "paused";

export type ResolveTaskScopeInput = {
  scope: TaskScope;
  creatorId: string;
  creatorDepartmentId: string | null;
  departmentIds?: string[] | null | undefined;
};

export type ResolvedTaskScope = {
  targetType: TaskDbTargetType;
  targetUserId: string | null;
  assignedTo: string | null;
  departmentId: string | null;
  targetDepartmentIds: string[];
};

/**
 * تنظيف مصفوفة معرّفات الأقسام: إزالة الفراغات والقيم غير النصية وتكرار المعرّفات.
 */
export function sanitizeDepartmentIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const cleanList: string[] = [];
  const seen = new Set<string>();

  for (const item of ids) {
    if (typeof item === "string" && item.trim()) {
      const clean = item.trim();
      if (!seen.has(clean)) {
        seen.add(clean);
        cleanList.push(clean);
      }
    }
  }
  return cleanList;
}

/**
 * ربط النطاق بالقاعدة بناءً على القواعد الصارمة:
 * - self: target_type=self, target_user_id=المنشئ, assigned_to=المنشئ, department_id=null, target_department_ids=[]
 * - own_department: target_type=department, department_id=قسم المنشئ, target_department_ids=[قسم المنشئ]
 * - departments:
 *    - إذا قسم واحد: target_type=department, department_id=القسم, target_department_ids=[القسم]
 *    - إذا عدة أقسام: target_type=multiple_departments, department_id=null, target_department_ids=القائمة
 * - all: target_type=all_departments, department_id=null, target_department_ids=[]
 */
export function resolveTaskScope(input: ResolveTaskScopeInput): ResolvedTaskScope {
  const { scope, creatorId, creatorDepartmentId, departmentIds } = input;

  if (scope === "self") {
    return {
      targetType: "self",
      targetUserId: creatorId,
      assignedTo: creatorId,
      departmentId: null,
      targetDepartmentIds: [],
    };
  }

  if (scope === "own_department") {
    const deptId = creatorDepartmentId ?? null;
    return {
      targetType: "department",
      targetUserId: null,
      assignedTo: null,
      departmentId: deptId,
      targetDepartmentIds: deptId ? [deptId] : [],
    };
  }

  if (scope === "departments") {
    const cleanIds = sanitizeDepartmentIds(departmentIds);
    if (cleanIds.length === 1) {
      return {
        targetType: "department",
        targetUserId: null,
        assignedTo: null,
        departmentId: cleanIds[0],
        targetDepartmentIds: cleanIds,
      };
    }
    return {
      targetType: "multiple_departments",
      targetUserId: null,
      assignedTo: null,
      departmentId: null,
      targetDepartmentIds: cleanIds,
    };
  }

  if (scope === "all") {
    return {
      targetType: "all_departments",
      targetUserId: null,
      assignedTo: null,
      departmentId: null,
      targetDepartmentIds: [],
    };
  }

  // fallback افتراضي آمن
  return {
    targetType: "self",
    targetUserId: creatorId,
    assignedTo: creatorId,
    departmentId: null,
    targetDepartmentIds: [],
  };
}

export type BuildTaskInsertInput = {
  title: string | unknown;
  description?: string | null | unknown;
  requestedHours?: number | null | unknown;
  dueDate?: string | null | unknown;
  [key: string]: unknown;
};

export type ServerTaskContext = {
  creatorId: string;
  scopeResolved: ResolvedTaskScope;
};

export type TaskInsertPayload = {
  title: string;
  description: string | null;
  target_type: TaskDbTargetType;
  target_user_id: string | null;
  target_department_ids: string[];
  department_id: string | null;
  status: TaskDbStatus;
  requested_hours: number | null;
  due_date: string | null;
  created_by: string;
  assigned_to: string | null;
  reviewed_by: null;
  reviewed_at: null;
  review_decision: null;
  review_reason: null;
};

/**
 * بناء حمولة إنشاء مهمة جديدة في جدول tasks.
 * تتجاهل تماماً أي قيم حساسة أو حالات أو معرفات قادمة من العميل.
 */
export function buildTaskInsertPayload(
  input: BuildTaskInsertInput,
  context: ServerTaskContext
): TaskInsertPayload {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : null;

  const requestedHours =
    input.requestedHours !== undefined &&
    input.requestedHours !== null &&
    input.requestedHours !== ""
      ? Number(input.requestedHours)
      : null;

  const dueDate =
    typeof input.dueDate === "string" && input.dueDate.trim()
      ? input.dueDate.trim()
      : null;

  return {
    title,
    description,
    target_type: context.scopeResolved.targetType,
    target_user_id: context.scopeResolved.targetUserId,
    target_department_ids: context.scopeResolved.targetDepartmentIds,
    department_id: context.scopeResolved.departmentId,
    status: "in_progress",
    requested_hours: requestedHours,
    due_date: dueDate,
    created_by: context.creatorId,
    assigned_to: context.scopeResolved.assignedTo,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_reason: null,
  };
}

export type TaskAuditAction = "create_task";

export type BuildTaskAuditLogInput = {
  actorId: string;
  action: TaskAuditAction;
  taskId: string;
  departmentId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown>;
  details?: string | null;
};

export type TaskAuditLogInsertPayload = {
  actor_id: string;
  category: "tasks";
  action: TaskAuditAction;
  target_type: "tasks";
  target_id: string;
  target_user_id: string;
  department_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  details: string | null;
};

/**
 * بناء حمولة سجل التدقيق لجدول audit_logs للمهام.
 */
export function buildTaskAuditLogPayload(
  input: BuildTaskAuditLogInput
): TaskAuditLogInsertPayload {
  return {
    actor_id: input.actorId,
    category: "tasks",
    action: input.action,
    target_type: "tasks",
    target_id: input.taskId,
    target_user_id: input.actorId,
    department_id: input.departmentId,
    before_data: input.beforeData,
    after_data: input.afterData,
    details: input.details ?? null,
  };
}

export type TaskViewRecord = {
  id: string | number;
  created_by: string;
  target_user_id?: string | null;
  assigned_to?: string | null;
  department_id?: string | null;
  target_type?: string | null;
  target_department_ids?: string[] | unknown;
  [key: string]: unknown;
};

/**
 * التحقق من أحقية المستخدم برؤية المهمة (دالة نقية):
 * - المتطوع: مهام target_user_id = هو، أو مهام قسمه (department_id = قسمه)،
 *   أو مهام تحتوي قسمه في target_department_ids، أو all_departments، أو التي أنشأها (created_by = هو).
 * - رئيس القسم: نفس ما سبق (قسمه) إضافة لما أنشأه.
 * - HR و ADMIN و SUPER_ADMIN: كل المهام.
 */
export function canViewTask(params: {
  userRole: UserRole;
  userId: string;
  userDepartmentId: string | null;
  task: TaskViewRecord;
}): boolean {
  const { userRole, userId, userDepartmentId, task } = params;

  // الإدارة والموارد البشرية والرئيس العام يرون كل المهام
  if (
    userRole === "HR" ||
    userRole === "ADMIN" ||
    userRole === "SUPER_ADMIN"
  ) {
    return true;
  }

  // ما أنشأه المستخدم يراه دائماً
  if (task.created_by === userId) {
    return true;
  }

  // إذا كانت المهمة موجهة له شخصياً (target_user_id أو assigned_to)
  if (task.target_user_id === userId || task.assigned_to === userId) {
    return true;
  }

  // مهمة عامة لجميع الأقسام
  if (task.target_type === "all_departments") {
    return true;
  }

  // فحص الارتباط بالقسم إذا كان المستخدم ينتمي لقسم
  if (userDepartmentId) {
    // مهمة خاصة بقسمه
    if (task.department_id === userDepartmentId) {
      return true;
    }

    // مهمة تشمل قسمه ضمن target_department_ids
    if (Array.isArray(task.target_department_ids)) {
      if (task.target_department_ids.includes(userDepartmentId)) {
        return true;
      }
    }
  }

  return false;
}
