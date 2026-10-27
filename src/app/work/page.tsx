"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageShell from "../components/PageShell";
import PageTitle from "../components/PageTitle";
import RoleGuard from "../components/RoleGuard";
import Card from "../components/Card";
import Button from "../components/Button";
import { useAuth } from "../lib/auth-context";
import { ROLE_NAMES, type UserRole } from "../lib/roles";

// ─────────────────────────────────────────────────────────────
// أنواع البيانات
// ─────────────────────────────────────────────────────────────

type AssignmentTask = {
  id: string;
  title: string;
  description: string | null;
  lifecycle_status: string;
  priority: string;
  due_date: string | null;
  created_by: string;
  required_assignees: number | null;
};

type TaskAssignment = {
  id: string;
  task_id: string;
  user_id: string;
  status: string;
  offered_by: string | null;
  accepted_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  status_reason: string | null;
  approved_hours: number | null;
  created_at: string;
  updated_at: string;
  task: AssignmentTask | AssignmentTask[];
};

type AvailableTask = {
  id: string;
  title: string;
  description: string | null;
  lifecycle_status: string;
  priority: string;
  due_date: string | null;
  created_by: string;
  target_user_id: string | null;
  required_assignees: number | null;
  department_id: string | null;
  target_department_ids: string[] | null;
  target_type: string;
  created_at: string;
  updated_at: string;
};

type DeclinedRecord = {
  id: string;
  user_id: string;
  user_name?: string;
  status_reason: string | null;
  updated_at: string;
};

type CreatedTask = {
  id: string;
  title: string;
  description: string | null;
  lifecycle_status: string;
  priority: string;
  due_date: string | null;
  created_by: string;
  required_assignees: number | null;
  target_type: string;
  created_at: string;
  updated_at: string;
  declinedAssignments?: DeclinedRecord[];
};

type ReviewAssignment = {
  id: string;
  task_id: string;
  user_id: string;
  status: string;
  offered_by: string | null;
  accepted_at: string | null;
  submitted_at: string | null;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  volunteer_name: string;
  volunteer_role: UserRole | null;
  volunteer_department_id: string | null;
  task_title: string;
  task_description: string | null;
  task_department_id: string | null;
  task_priority: string;
  task_due_date: string | null;
};

type TeamMember = {
  id: string;
  name: string;
  role: UserRole;
  department_id: string | null;
  active_tasks_count: number;
  overdue_tasks_count: number;
  approved_tasks_count: number;
};

type DepartmentItem = {
  id: string;
  name: string;
};

type TabType = "my-tasks" | "available" | "created" | "review" | "team";

type TaskScopeOption = "self" | "own_department" | "departments" | "all";

type ReasonModalState = {
  isOpen: boolean;
  type: "decline" | "withdraw";
  assignmentId: string;
  taskTitle: string;
  reason: string;
  error: string | null;
  isSubmitting: boolean;
};

type CancelTaskModalState = {
  isOpen: boolean;
  taskId: string;
  taskTitle: string;
  reason: string;
  error: string | null;
  isSubmitting: boolean;
};

type ReassignModalState = {
  isOpen: boolean;
  assignmentId: string;
  taskTitle: string;
  prevUserName: string;
  targetUserId: string;
  error: string | null;
  isSubmitting: boolean;
};

type ReviewModalState = {
  isOpen: boolean;
  assignmentId: string;
  taskTitle: string;
  volunteerName: string;
  action: "approve" | "revise" | "reject_final";
  hours: string;
  notes: string;
  error: string | null;
  isSubmitting: boolean;
};

// ─────────────────────────────────────────────────────────────
// دوال مساعدة لترويسات تيليجرام والتاريخ والتنسيق
// ─────────────────────────────────────────────────────────────

function getTelegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initData || null;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const initData = getTelegramInitData();
  return {
    ...(initData ? { "x-telegram-init-data": initData } : {}),
    ...(extra ?? {}),
  };
}

function getTodayRiyadh(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Riyadh",
  });
}

function getAssignmentStatusLabel(status: string): string {
  switch (status) {
    case "offered":
      return "معروضة";
    case "in_progress":
      return "قيد التنفيذ";
    case "submitted":
      return "تم التسليم";
    case "needs_revision":
      return "مطلوب تعديل";
    case "approved":
      return "معتمدة";
    case "rejected_final":
      return "مرفوضة نهائياً";
    case "declined":
      return "معتذر عنها";
    case "withdrawn":
      return "منسحب منها";
    case "released":
      return "مسحوبة";
    default:
      return status;
  }
}

function getAssignmentBadgeClass(status: string): string {
  switch (status) {
    case "offered":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20";
    case "in_progress":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20";
    case "submitted":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20";
    case "needs_revision":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/20";
    case "approved":
      return "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20";
    case "rejected_final":
      return "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20";
    case "declined":
    case "withdrawn":
    case "released":
      return "bg-molim-soft text-molim-muted border border-[var(--card-border)]";
    default:
      return "bg-molim-soft text-molim-muted border border-[var(--card-border)]";
  }
}

function getLifecycleStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "مفتوحة";
    case "completed":
      return "مكتملة";
    case "cancelled":
      return "ملغاة";
    default:
      return status;
  }
}

function getLifecycleBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20";
    case "completed":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20";
    case "cancelled":
      return "bg-molim-soft text-molim-muted border border-[var(--card-border)]";
    default:
      return "bg-molim-soft text-molim-muted border border-[var(--card-border)]";
  }
}

function resolveTask(taskRaw: AssignmentTask | AssignmentTask[]): AssignmentTask | null {
  if (Array.isArray(taskRaw)) {
    return taskRaw[0] ?? null;
  }
  return taskRaw ?? null;
}

// ─────────────────────────────────────────────────────────────
// المكون الرئيسي للصفحة
// ─────────────────────────────────────────────────────────────

export default function WorkPage() {
  const { user: currentUser } = useAuth();
  const isNonVolunteer = currentUser && currentUser.role !== "VOLUNTEER";

  const [activeTab, setActiveTab] = useState<TabType>("my-tasks");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // بيانات التبويبات الثلاثة الأساسية
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [createdTasks, setCreatedTasks] = useState<CreatedTask[]>([]);

  // بيانات تبويب المراجعة
  const [reviewAssignments, setReviewAssignments] = useState<ReviewAssignment[]>([]);
  const [reviewLoading, setReviewLoading] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // بيانات تبويب الفريق
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState<boolean>(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // حالة تنفيذ العمليات السريعة (مثل قبول أو تسليم)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; error?: string; success?: string } | null>(null);

  // نافذة السبب الإجباري للاعتذار والانسحاب
  const [reasonModal, setReasonModal] = useState<ReasonModalState>({
    isOpen: false,
    type: "decline",
    assignmentId: "",
    taskTitle: "",
    reason: "",
    error: null,
    isSubmitting: false,
  });

  // نافذة إلغاء مهمة
  const [cancelModal, setCancelModal] = useState<CancelTaskModalState>({
    isOpen: false,
    taskId: "",
    taskTitle: "",
    reason: "",
    error: null,
    isSubmitting: false,
  });

  // نافذة إعادة توجيه مهمة
  const [reassignModal, setReassignModal] = useState<ReassignModalState>({
    isOpen: false,
    assignmentId: "",
    taskTitle: "",
    prevUserName: "",
    targetUserId: "",
    error: null,
    isSubmitting: false,
  });

  // نافذة المراجعة
  const [reviewModal, setReviewModal] = useState<ReviewModalState>({
    isOpen: false,
    assignmentId: "",
    taskTitle: "",
    volunteerName: "",
    action: "approve",
    hours: "1",
    notes: "",
    error: null,
    isSubmitting: false,
  });

  // نافذة إنشاء مهمة جديدة
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPriority, setCreatePriority] = useState<"normal" | "urgent">("normal");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createAssignees, setCreateAssignees] = useState("");
  const [createScope, setCreateScope] = useState<TaskScopeOption>("self");
  const [createTargetUserId, setCreateTargetUserId] = useState("");
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [allDepartments, setAllDepartments] = useState<DepartmentItem[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const todayRiyadh = getTodayRiyadh();

  // جلب البيانات الأساسية
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setActionFeedback(null);

    try {
      const res = await fetch("/api/task-assignments", {
        headers: authHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrorMsg("غير مصرح لك بعرض هذه الصفحة.");
        } else {
          setErrorMsg("تعذر جلب بيانات المهام. يرجى المحاولة لاحقاً.");
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.ok) {
        setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
        setAvailableTasks(Array.isArray(data.availableTasks) ? data.availableTasks : []);
        setCreatedTasks(Array.isArray(data.createdTasks) ? data.createdTasks : []);
      } else {
        setErrorMsg(data.error || "حدث خطأ غير متوقع.");
      }
    } catch {
      setErrorMsg("فشل الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
    } finally {
      setLoading(false);
    }
  }, []);

  // جلب مهام المراجعة
  const loadReviewData = useCallback(async () => {
    if (!isNonVolunteer) return;
    setReviewLoading(true);
    setReviewError(null);

    try {
      const res = await fetch("/api/task-assignments/review", {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setReviewError(data.error || "تعذر جلب التكليفات للمراجعة.");
      } else {
        setReviewAssignments(Array.isArray(data.assignments) ? data.assignments : []);
      }
    } catch {
      setReviewError("فشل الاتصال بالخادم أثناء جلب مهام المراجعة.");
    } finally {
      setReviewLoading(false);
    }
  }, [isNonVolunteer]);

  // جلب بيانات الفريق
  const loadTeamData = useCallback(async () => {
    if (!isNonVolunteer) return;
    setTeamLoading(true);
    setTeamError(null);

    try {
      const res = await fetch("/api/task-assignments/team", {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setTeamError(data.error || "تعذر جلب بيانات الفريق.");
      } else {
        setTeamMembers(Array.isArray(data.members) ? data.members : []);
      }
    } catch {
      setTeamError("فشل الاتصال بالخادم أثناء جلب بيانات الفريق.");
    } finally {
      setTeamLoading(false);
    }
  }, [isNonVolunteer]);

  // جلب قائمة الأقسام لإنشاء مهمة
  const loadDepartments = useCallback(async () => {
    if (!isNonVolunteer) return;
    try {
      const res = await fetch("/api/departments", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.departments)) {
        setAllDepartments(data.departments);
      }
    } catch {
      // تجاهل إذا لم تتوفر
    }
  }, [isNonVolunteer]);

  useEffect(() => {
    loadData();
    if (isNonVolunteer) {
      loadReviewData();
      loadTeamData();
      loadDepartments();
    }
  }, [loadData, loadReviewData, loadTeamData, loadDepartments, isNonVolunteer]);

  // خيارات النطاق المتاحة حسب الدور
  const availableScopes = useMemo<{ value: TaskScopeOption; label: string }[]>(() => {
    const role = currentUser?.role;
    if (role === "VOLUNTEER") {
      return [{ value: "self", label: "لنفسي فقط" }];
    }
    if (role === "DEPARTMENT_HEAD") {
      return [
        { value: "self", label: "لنفسي" },
        { value: "own_department", label: "لقسمي" },
      ];
    }
    if (role === "HR" || role === "ADMIN") {
      return [
        { value: "self", label: "لنفسي" },
        { value: "own_department", label: "لقسمي" },
        { value: "departments", label: "لأقسام محددة" },
      ];
    }
    if (role === "SUPER_ADMIN") {
      return [
        { value: "self", label: "لنفسي" },
        { value: "own_department", label: "لقسمي" },
        { value: "departments", label: "لأقسام محددة" },
        { value: "all", label: "لجميع الأقسام" },
      ];
    }
    return [{ value: "self", label: "لنفسي" }];
  }, [currentUser?.role]);

  // قبول التكليف أو استلام مهمة متاحة
  async function handleClaim(taskId: string, identifierKey: string) {
    setActionLoadingId(identifierKey);
    setActionFeedback(null);

    try {
      const res = await fetch("/api/task-assignments/claim", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ taskId }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setActionFeedback({
          id: identifierKey,
          error: "تغيرت الحالة، حدّث الصفحة.",
        });
        await loadData();
        return;
      }

      if (!res.ok || !data.ok) {
        const errorText = data.error || (data.code ? `خطأ: ${data.code}` : "تعذر استلام المهمة.");
        setActionFeedback({ id: identifierKey, error: errorText });
        return;
      }

      setActionFeedback({ id: identifierKey, success: "تم استلام المهمة بنجاح." });
      await loadData();
    } catch {
      setActionFeedback({
        id: identifierKey,
        error: "فشل الاتصال بالخادم أثناء الاستلام.",
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  // تسليم المهمة
  async function handleSubmit(assignmentId: string) {
    setActionLoadingId(assignmentId);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/task-assignments/${encodeURIComponent(assignmentId)}/submit`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setActionFeedback({
          id: assignmentId,
          error: "تغيرت الحالة، حدّث الصفحة.",
        });
        await loadData();
        return;
      }

      if (!res.ok || !data.ok) {
        setActionFeedback({
          id: assignmentId,
          error: data.error || "تعذر تسليم المهمة.",
        });
        return;
      }

      setActionFeedback({ id: assignmentId, success: "تم تسليم المهمة بنجاح للمراجعة." });
      await loadData();
    } catch {
      setActionFeedback({
        id: assignmentId,
        error: "فشل الاتصال بالخادم أثناء التسليم.",
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  // فتح نافذة السبب للاعتذار أو الانسحاب
  function openReasonModal(type: "decline" | "withdraw", assignmentId: string, taskTitle: string) {
    setReasonModal({
      isOpen: true,
      type,
      assignmentId,
      taskTitle,
      reason: "",
      error: null,
      isSubmitting: false,
    });
  }

  function closeReasonModal() {
    if (reasonModal.isSubmitting) return;
    setReasonModal((prev) => ({ ...prev, isOpen: false, error: null }));
  }

  async function handleConfirmReason() {
    const trimmed = reasonModal.reason.trim();
    if (trimmed.length < 10) {
      setReasonModal((prev) => ({
        ...prev,
        error: "يجب ألا يقل السبب عن 10 أحرف.",
      }));
      return;
    }

    setReasonModal((prev) => ({ ...prev, isSubmitting: true, error: null }));
    const endpoint = `/api/task-assignments/${encodeURIComponent(reasonModal.assignmentId)}/${reasonModal.type}`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setReasonModal((prev) => ({
          ...prev,
          isSubmitting: false,
          error: "تغيرت الحالة، حدّث الصفحة.",
        }));
        await loadData();
        return;
      }

      if (!res.ok || !data.ok) {
        setReasonModal((prev) => ({
          ...prev,
          isSubmitting: false,
          error: data.error || "تعذر إتمام الإجراء. حاول لاحقاً.",
        }));
        return;
      }

      setReasonModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
      await loadData();
    } catch {
      setReasonModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: "فشل الاتصال بالخادم أثناء تنفيذ الطلب.",
      }));
    }
  }

  // نافذة إلغاء مهمة
  function openCancelModal(taskId: string, taskTitle: string) {
    setCancelModal({
      isOpen: true,
      taskId,
      taskTitle,
      reason: "",
      error: null,
      isSubmitting: false,
    });
  }

  function closeCancelModal() {
    if (cancelModal.isSubmitting) return;
    setCancelModal((prev) => ({ ...prev, isOpen: false, error: null }));
  }

  async function handleConfirmCancel() {
    const trimmed = cancelModal.reason.trim();
    if (trimmed.length < 10) {
      setCancelModal((prev) => ({ ...prev, error: "يجب ألا يقل سبب الإلغاء عن 10 أحرف." }));
      return;
    }

    setCancelModal((prev) => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const res = await fetch(`/api/task-assignments/tasks/${encodeURIComponent(cancelModal.taskId)}/cancel`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setCancelModal((prev) => ({ ...prev, isSubmitting: false, error: "تغيرت الحالة، حدّث الصفحة." }));
        await loadData();
        return;
      }

      if (!res.ok || !data.ok) {
        setCancelModal((prev) => ({ ...prev, isSubmitting: false, error: data.error || "تعذر إلغاء المهمة." }));
        return;
      }

      setCancelModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
      await loadData();
    } catch {
      setCancelModal((prev) => ({ ...prev, isSubmitting: false, error: "فشل الاتصال بالخادم أثناء الإلغاء." }));
    }
  }

  // نافذة إعادة توجيه مهمة
  function openReassignModal(assignmentId: string, taskTitle: string, prevUserName: string) {
    setReassignModal({
      isOpen: true,
      assignmentId,
      taskTitle,
      prevUserName,
      targetUserId: "",
      error: null,
      isSubmitting: false,
    });
  }

  function closeReassignModal() {
    if (reassignModal.isSubmitting) return;
    setReassignModal((prev) => ({ ...prev, isOpen: false, error: null }));
  }

  async function handleConfirmReassign() {
    const trimmedTarget = reassignModal.targetUserId.trim().toUpperCase();
    const molRegex = /^MOL-\d{5}$/;
    if (!molRegex.test(trimmedTarget)) {
      setReassignModal((prev) => ({
        ...prev,
        error: "يجب إدخال معرّف عضو بصيغة MOL-XXXXX صالحة (مثال: MOL-00042).",
      }));
      return;
    }

    setReassignModal((prev) => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const res = await fetch(`/api/task-assignments/${encodeURIComponent(reassignModal.assignmentId)}/reassign`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ targetUserId: trimmedTarget }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setReassignModal((prev) => ({
          ...prev,
          isSubmitting: false,
          error: data.error || "تغيرت الحالة، حدّث الصفحة.",
        }));
        await loadData();
        return;
      }

      if (!res.ok || !data.ok) {
        setReassignModal((prev) => ({
          ...prev,
          isSubmitting: false,
          error: data.error || "تعذر إعادة توجيه المهمة.",
        }));
        return;
      }

      setReassignModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
      await loadData();
    } catch {
      setReassignModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: "فشل الاتصال بالخادم أثناء إعادة التوجيه.",
      }));
    }
  }

  // مراجعة المهمة
  function openReviewModal(
    asgn: ReviewAssignment,
    action: "approve" | "revise" | "reject_final"
  ) {
    setReviewModal({
      isOpen: true,
      assignmentId: asgn.id,
      taskTitle: asgn.task_title,
      volunteerName: asgn.volunteer_name,
      action,
      hours: "1",
      notes: "",
      error: null,
      isSubmitting: false,
    });
  }

  function closeReviewModal() {
    if (reviewModal.isSubmitting) return;
    setReviewModal((prev) => ({ ...prev, isOpen: false, error: null }));
  }

  async function handleConfirmReview() {
    const { action, hours, notes, assignmentId } = reviewModal;
    let approvedHoursNum: number | undefined = undefined;

    if (action === "approve") {
      const num = Number(hours);
      if (Number.isNaN(num) || num < 0.25 || num > 24 || Math.abs(num * 4 - Math.round(num * 4)) > 1e-6) {
        setReviewModal((prev) => ({
          ...prev,
          error: "الساعات المعتمدة يجب أن تكون بين 0.25 و 24 وبخطوات 0.25.",
        }));
        return;
      }
      approvedHoursNum = num;
    } else {
      const trimmedNotes = notes.trim();
      if (trimmedNotes.length < 10) {
        setReviewModal((prev) => ({
          ...prev,
          error: "يجب كتابة ملاحظات واضحة لا تقل عن 10 أحرف.",
        }));
        return;
      }
    }

    setReviewModal((prev) => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const res = await fetch(`/api/task-assignments/${encodeURIComponent(assignmentId)}/review`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          decision: action,
          notes: notes.trim() || undefined,
          approvedHours: approvedHoursNum,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setReviewModal((prev) => ({
          ...prev,
          isSubmitting: false,
          error: "تغيرت الحالة، حدّث الصفحة.",
        }));
        await loadReviewData();
        await loadData();
        return;
      }

      if (!res.ok || !data.ok) {
        const errText = data.error || (data.code ? `خطأ: ${data.code}` : "تعذر إتمام المراجعة.");
        setReviewModal((prev) => ({ ...prev, isSubmitting: false, error: errText }));
        return;
      }

      setReviewModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
      await loadReviewData();
      await loadData();
    } catch {
      setReviewModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: "فشل الاتصال بالخادم أثناء المراجعة.",
      }));
    }
  }

  // إرسال إنشاء مهمة جديدة
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    const titleTrimmed = createTitle.trim();
    if (!titleTrimmed) {
      setCreateError("عنوان المهمة مطلوب.");
      return;
    }
    if (titleTrimmed.length > 150) {
      setCreateError("عنوان المهمة لا يجب أن يتجاوز 150 حرفاً.");
      return;
    }

    const descTrimmed = createDescription.trim();
    if (descTrimmed.length > 2000) {
      setCreateError("الوصف لا يجب أن يتجاوز 2000 حرف.");
      return;
    }

    if (createScope === "departments" && selectedDeptIds.length === 0) {
      setCreateError("يرجى اختيار قسم واحد على الأقل.");
      return;
    }

    let assigneesNum: number | null = null;
    if (createAssignees.trim()) {
      const n = Number(createAssignees);
      if (Number.isNaN(n) || n < 1 || n > 50 || !Number.isInteger(n)) {
        setCreateError("عدد المنفذين يجب أن يكون رقماً صحيحاً بين 1 و 50.");
        return;
      }
      assigneesNum = n;
    }

    const targetUserTrimmed = createTargetUserId.trim().toUpperCase();
    if (targetUserTrimmed) {
      const molRegex = /^MOL-\d{5}$/;
      if (!molRegex.test(targetUserTrimmed)) {
        setCreateError("معرف العضو المستهدف يجب أن يكون بصيغة MOL-XXXXX صالحة.");
        return;
      }
      if (createScope === "self") {
        setCreateError("لا يمكن تحديد مستخدم مستهدف آخر مع نطاق المهمة الشخصية (لنفسي).");
        return;
      }
    }

    setCreateSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        title: titleTrimmed,
        description: descTrimmed || undefined,
        priority: createPriority,
        dueDate: createDueDate.trim() || undefined,
        requiredAssignees: assigneesNum,
        scope: createScope,
        departmentIds: createScope === "departments" ? selectedDeptIds : undefined,
        targetUserId: targetUserTrimmed || undefined,
      };

      const res = await fetch("/api/task-assignments/tasks", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setCreateError(data.error || "تعذر إنشاء المهمة.");
        setCreateSubmitting(false);
        return;
      }

      // نجاح
      setIsCreateOpen(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreatePriority("normal");
      setCreateDueDate("");
      setCreateAssignees("");
      setCreateScope("self");
      setCreateTargetUserId("");
      setSelectedDeptIds([]);
      setCreateSubmitting(false);

      await loadData();
    } catch {
      setCreateError("فشل الاتصال بالخادم أثناء إنشاء المهمة.");
      setCreateSubmitting(false);
    }
  }

  function toggleDepartmentSelect(deptId: string) {
    setSelectedDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  }

  return (
    <RoleGuard allowedRoles={["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell>
        <PageTitle
          title="المهام والعمل"
          category="متابعة وإدارة المهام"
          description="متابعة التكليفات المسندة إليك، استلام المهام المتاحة، واستعراض المهام التي أنشأتها."
          action={
            <Button
              type="button"
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              className="text-xs px-4"
            >
              مهمة جديدة
            </Button>
          }
        />

        {/* شريط التبويبات */}
        <div className="border-b border-[var(--card-border)] mb-6 overflow-x-auto">
          <nav className="flex space-x-6 space-x-reverse min-w-max" aria-label="تبويبات العمل">
            <button
              type="button"
              onClick={() => setActiveTab("my-tasks")}
              className={`py-3 px-1 min-h-[44px] text-sm font-bold border-b-2 transition-colors ${
                activeTab === "my-tasks"
                  ? "border-[var(--molim-orange)] text-molim-foreground"
                  : "border-transparent text-molim-muted hover:text-molim-foreground"
              }`}
            >
              مهامي ({assignments.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("available")}
              className={`py-3 px-1 min-h-[44px] text-sm font-bold border-b-2 transition-colors ${
                activeTab === "available"
                  ? "border-[var(--molim-orange)] text-molim-foreground"
                  : "border-transparent text-molim-muted hover:text-molim-foreground"
              }`}
            >
              متاحة للاستلام ({availableTasks.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("created")}
              className={`py-3 px-1 min-h-[44px] text-sm font-bold border-b-2 transition-colors ${
                activeTab === "created"
                  ? "border-[var(--molim-orange)] text-molim-foreground"
                  : "border-transparent text-molim-muted hover:text-molim-foreground"
              }`}
            >
              أنشأتها ({createdTasks.length})
            </button>

            {isNonVolunteer && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab("review")}
                  className={`py-3 px-1 min-h-[44px] text-sm font-bold border-b-2 transition-colors ${
                    activeTab === "review"
                      ? "border-[var(--molim-orange)] text-molim-foreground"
                      : "border-transparent text-molim-muted hover:text-molim-foreground"
                  }`}
                >
                  بانتظار مراجعتي ({reviewAssignments.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("team")}
                  className={`py-3 px-1 min-h-[44px] text-sm font-bold border-b-2 transition-colors ${
                    activeTab === "team"
                      ? "border-[var(--molim-orange)] text-molim-foreground"
                      : "border-transparent text-molim-muted hover:text-molim-foreground"
                  }`}
                >
                  الفريق ({teamMembers.length})
                </button>
              </>
            )}
          </nav>
        </div>

        {/* حالة التحميل العام */}
        {loading && (
          <div className="py-16 text-center text-molim-muted">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-molim border-t-[var(--molim-orange)] mb-3" />
            <p className="text-sm font-bold">جاري تحميل قائمة المهام...</p>
          </div>
        )}

        {/* حالة الخطأ العام */}
        {!loading && errorMsg && (
          <div className="py-12 text-center space-y-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
            <Button variant="outline" onClick={loadData}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* محتوى التبويبات */}
        {!loading && !errorMsg && (
          <>
            {/* التبويب 1: مهامي */}
            {activeTab === "my-tasks" && (
              <div className="space-y-4">
                {assignments.length === 0 ? (
                  <Card className="p-8 text-center text-molim-muted">
                    <p className="text-sm font-medium">لا توجد لديك تكليفات حالية.</p>
                  </Card>
                ) : (
                  assignments.map((asgn) => {
                    const task = resolveTask(asgn.task);
                    const taskTitle = task?.title || "مهمة بلا عنوان";
                    const isUrgent = task?.priority === "urgent";
                    const dueDate = task?.due_date;
                    const isOverdue = Boolean(
                      dueDate &&
                        dueDate.trim() < todayRiyadh &&
                        (asgn.status === "in_progress" || asgn.status === "needs_revision")
                    );

                    const isActing = actionLoadingId === asgn.id;
                    const feedback = actionFeedback?.id === asgn.id ? actionFeedback : null;

                    return (
                      <Card key={asgn.id} className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-bold text-molim-foreground break-words">
                                {taskTitle}
                              </h2>

                              {isUrgent && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                                  عاجلة
                                </span>
                              )}

                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded ${getAssignmentBadgeClass(
                                  asgn.status
                                )}`}
                              >
                                {getAssignmentStatusLabel(asgn.status)}
                              </span>
                            </div>

                            {task?.description && (
                              <p className="text-xs text-molim-muted leading-relaxed line-clamp-2">
                                {task.description}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-xs">
                              {dueDate ? (
                                <span
                                  className={
                                    isOverdue
                                      ? "text-red-600 dark:text-red-400 font-bold"
                                      : "text-molim-muted"
                                  }
                                >
                                  الموعد: {dueDate}
                                  {isOverdue ? " (متأخرة)" : ""}
                                </span>
                              ) : (
                                <span className="text-molim-muted">الموعد: غير محدد</span>
                              )}

                              {asgn.approved_hours !== null && asgn.approved_hours !== undefined && (
                                <span className="text-molim-muted">
                                  الساعات المعتمدة: {asgn.approved_hours}
                                </span>
                              )}
                            </div>

                            {asgn.status_reason && (
                              <div className="mt-2 p-2.5 rounded bg-molim-soft border border-[var(--card-border)] text-xs text-molim-muted">
                                <span className="font-bold text-molim-foreground">ملاحظات القرار: </span>
                                <span>{asgn.status_reason}</span>
                              </div>
                            )}
                          </div>

                          {/* أزرار الإجراءات التفاعلية */}
                          <div className="flex flex-wrap sm:flex-col items-stretch gap-2 shrink-0 pt-2 sm:pt-0">
                            {asgn.status === "offered" && (
                              <>
                                <Button
                                  variant="primary"
                                  disabled={isActing}
                                  onClick={() => handleClaim(asgn.task_id, asgn.id)}
                                  className="text-xs px-3"
                                >
                                  {isActing ? "جاري الحفظ..." : "قبول"}
                                </Button>

                                <Button
                                  variant="outline"
                                  disabled={isActing}
                                  onClick={() => openReasonModal("decline", asgn.id, taskTitle)}
                                  className="text-xs px-3"
                                >
                                  اعتذار
                                </Button>
                              </>
                            )}

                            {(asgn.status === "in_progress" || asgn.status === "needs_revision") && (
                              <>
                                <Button
                                  variant="success"
                                  disabled={isActing}
                                  onClick={() => handleSubmit(asgn.id)}
                                  className="text-xs px-3"
                                >
                                  {isActing ? "جاري الإرسال..." : "تسليم"}
                                </Button>

                                <Button
                                  variant="outline"
                                  disabled={isActing}
                                  onClick={() => openReasonModal("withdraw", asgn.id, taskTitle)}
                                  className="text-xs px-3"
                                >
                                  انسحاب
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {feedback && (
                          <div className="mt-3 pt-2 border-t border-[var(--card-border)] text-xs">
                            {feedback.error && (
                              <p className="text-red-600 dark:text-red-400 font-medium">{feedback.error}</p>
                            )}
                            {feedback.success && (
                              <p className="text-green-600 dark:text-green-400 font-medium">{feedback.success}</p>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* التبويب 2: متاحة للاستلام */}
            {activeTab === "available" && (
              <div className="space-y-4">
                {availableTasks.length === 0 ? (
                  <Card className="p-8 text-center text-molim-muted">
                    <p className="text-sm font-medium">لا توجد مهام متاحة للاستلام حالياً.</p>
                  </Card>
                ) : (
                  availableTasks.map((t) => {
                    const cardId = `avail-${t.id}`;
                    const isUrgent = t.priority === "urgent";
                    const isActing = actionLoadingId === cardId;
                    const feedback = actionFeedback?.id === cardId ? actionFeedback : null;

                    return (
                      <Card key={t.id} className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-bold text-molim-foreground break-words">
                                {t.title}
                              </h2>

                              {isUrgent && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                                  عاجلة
                                </span>
                              )}
                            </div>

                            {t.description && (
                              <p className="text-xs text-molim-muted leading-relaxed line-clamp-3">
                                {t.description}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-xs text-molim-muted">
                              <span>الموعد: {t.due_date || "غير محدد"}</span>
                              {t.required_assignees && (
                                <span>المقاعد المطلوبة: {t.required_assignees}</span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 pt-2 sm:pt-0">
                            <Button
                              variant="primary"
                              disabled={isActing}
                              onClick={() => handleClaim(t.id, cardId)}
                              className="text-xs px-4"
                            >
                              {isActing ? "جاري الاستلام..." : "استلام"}
                            </Button>
                          </div>
                        </div>

                        {feedback && (
                          <div className="mt-3 pt-2 border-t border-[var(--card-border)] text-xs">
                            {feedback.error && (
                              <p className="text-red-600 dark:text-red-400 font-medium">{feedback.error}</p>
                            )}
                            {feedback.success && (
                              <p className="text-green-600 dark:text-green-400 font-medium">{feedback.success}</p>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* التبويب 3: أنشأتها */}
            {activeTab === "created" && (
              <div className="space-y-4">
                {createdTasks.length === 0 ? (
                  <Card className="p-8 text-center text-molim-muted">
                    <p className="text-sm font-medium">لم تقم بإنشاء أي مهام حتى الآن.</p>
                  </Card>
                ) : (
                  createdTasks.map((t) => {
                    const isUrgent = t.priority === "urgent";
                    const declined = t.declinedAssignments ?? [];
                    const isOpen = t.lifecycle_status === "open";

                    return (
                      <Card key={t.id} className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-bold text-molim-foreground break-words">
                                {t.title}
                              </h2>

                              {isUrgent && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                                  عاجلة
                                </span>
                              )}

                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded ${getLifecycleBadgeClass(
                                  t.lifecycle_status
                                )}`}
                              >
                                {getLifecycleStatusLabel(t.lifecycle_status)}
                              </span>
                            </div>

                            {t.description && (
                              <p className="text-xs text-molim-muted leading-relaxed line-clamp-2">
                                {t.description}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-xs text-molim-muted">
                              <span>الموعد: {t.due_date || "غير محدد"}</span>
                              {t.required_assignees && (
                                <span>المقاعد: {t.required_assignees}</span>
                              )}
                            </div>
                          </div>

                          {isOpen && (
                            <div className="shrink-0 pt-2 sm:pt-0">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => openCancelModal(t.id, t.title)}
                                className="text-xs px-3 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                              >
                                إلغاء المهمة
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* شارات السجلات المرفوضة لمهام الأفراد مع زر إعادة التوجيه */}
                        {declined.length > 0 && (
                          <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                            <p className="text-xs font-bold text-red-600 dark:text-red-400">
                              اعتذارات عن التكليف:
                            </p>

                            {declined.map((d) => (
                              <div
                                key={d.id}
                                className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-molim-foreground space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold">
                                    العضو: {d.user_name || d.user_id}
                                  </span>
                                  <span className="text-[11px] font-bold text-red-700 dark:text-red-300">
                                    مرفوضة
                                  </span>
                                </div>

                                {d.status_reason && (
                                  <p className="text-molim-muted">السبب: {d.status_reason}</p>
                                )}

                                {isOpen && (
                                  <div className="pt-1 flex justify-end">
                                    <Button
                                      type="button"
                                      variant="primary"
                                      onClick={() =>
                                        openReassignModal(d.id, t.title, d.user_name || d.user_id)
                                      }
                                      className="text-xs px-3"
                                    >
                                      إعادة توجيه
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* التبويب 4: بانتظار مراجعتي (لغير المتطوع) */}
            {isNonVolunteer && activeTab === "review" && (
              <div className="space-y-4">
                {reviewLoading && (
                  <div className="py-12 text-center text-molim-muted">
                    <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-molim border-t-[var(--molim-orange)] mb-2" />
                    <p className="text-xs font-medium">جاري جلب طلبات المراجعة...</p>
                  </div>
                )}

                {!reviewLoading && reviewError && (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-xs text-red-600 dark:text-red-400">{reviewError}</p>
                    <Button variant="outline" onClick={loadReviewData} className="text-xs">
                      إعادة المحاولة
                    </Button>
                  </div>
                )}

                {!reviewLoading && !reviewError && reviewAssignments.length === 0 && (
                  <Card className="p-8 text-center text-molim-muted">
                    <p className="text-sm font-medium">لا توجد تكليفات بانتظار مراجعتك حالياً.</p>
                  </Card>
                )}

                {!reviewLoading &&
                  !reviewError &&
                  reviewAssignments.map((asgn) => {
                    const isUrgent = asgn.task_priority === "urgent";

                    return (
                      <Card key={asgn.id} className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-bold text-molim-foreground break-words">
                                {asgn.task_title}
                              </h2>

                              {isUrgent && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                                  عاجلة
                                </span>
                              )}

                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                بانتظار المراجعة
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-molim-muted">
                              <span>
                                المنفذ:{" "}
                                <strong className="text-molim-foreground">
                                  {asgn.volunteer_name}
                                </strong>
                              </span>
                              <span>الموعد: {asgn.task_due_date || "غير محدد"}</span>
                              {asgn.submitted_at && (
                                <span>
                                  تاريخ التسليم: {new Date(asgn.submitted_at).toLocaleDateString("ar-SA")}
                                </span>
                              )}
                            </div>

                            {asgn.task_description && (
                              <p className="text-xs text-molim-muted leading-relaxed line-clamp-2">
                                {asgn.task_description}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap sm:flex-col items-stretch gap-2 shrink-0 pt-2 sm:pt-0">
                            <Button
                              type="button"
                              variant="success"
                              onClick={() => openReviewModal(asgn, "approve")}
                              className="text-xs px-3"
                            >
                              اعتماد
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => openReviewModal(asgn, "revise")}
                              className="text-xs px-3"
                            >
                              طلب تعديل
                            </Button>

                            <Button
                              type="button"
                              variant="danger"
                              onClick={() => openReviewModal(asgn, "reject_final")}
                              className="text-xs px-3"
                            >
                              رفض نهائي
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
              </div>
            )}

            {/* التبويب 5: الفريق (لغير المتطوع) */}
            {isNonVolunteer && activeTab === "team" && (
              <div className="space-y-4">
                {teamLoading && (
                  <div className="py-12 text-center text-molim-muted">
                    <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-molim border-t-[var(--molim-orange)] mb-2" />
                    <p className="text-xs font-medium">جاري جلب بيانات الفريق...</p>
                  </div>
                )}

                {!teamLoading && teamError && (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-xs text-red-600 dark:text-red-400">{teamError}</p>
                    <Button variant="outline" onClick={loadTeamData} className="text-xs">
                      إعادة المحاولة
                    </Button>
                  </div>
                )}

                {!teamLoading && !teamError && teamMembers.length === 0 && (
                  <Card className="p-8 text-center text-molim-muted">
                    <p className="text-sm font-medium">لا يوجد أعضاء في الفريق حالياً.</p>
                  </Card>
                )}

                {!teamLoading && !teamError && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamMembers.map((m) => (
                      <Card key={m.id} className="p-4 sm:p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-molim-foreground">{m.name}</h3>
                            <p className="text-xs text-molim-muted mt-0.5">{m.id}</p>
                          </div>

                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-molim-soft text-molim-foreground border border-[var(--card-border)]">
                            {ROLE_NAMES[m.role] || m.role}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--card-border)] text-center text-xs">
                          <div className="p-2 rounded bg-molim-soft">
                            <span className="text-molim-muted block text-[11px]">النشطة</span>
                            <span className="font-bold text-molim-foreground text-sm">
                              {m.active_tasks_count}
                            </span>
                          </div>

                          <div className="p-2 rounded bg-molim-soft">
                            <span className="text-molim-muted block text-[11px]">المتأخرة</span>
                            <span
                              className={`font-bold text-sm ${
                                m.overdue_tasks_count > 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-molim-foreground"
                              }`}
                            >
                              {m.overdue_tasks_count}
                            </span>
                          </div>

                          <div className="p-2 rounded bg-molim-soft">
                            <span className="text-molim-muted block text-[11px]">المعتمدة</span>
                            <span className="font-bold text-molim-foreground text-sm">
                              {m.approved_tasks_count}
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* نافذة السبب الإجباري للاعتذار أو الانسحاب */}
        {reasonModal.isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reason-modal-title"
          >
            <div className="w-full max-w-lg rounded-xl bg-molim-surface border border-[var(--card-border)] p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h3 id="reason-modal-title" className="text-lg font-bold text-molim-foreground">
                  {reasonModal.type === "decline"
                    ? "تأكيد الاعتذار عن التكليف"
                    : "تأكيد الانسحاب من المهمة"}
                </h3>
                <p className="text-xs text-molim-muted mt-1 break-words">
                  المهمة: {reasonModal.taskTitle}
                </p>
              </div>

              <div>
                <label
                  htmlFor="reason-input"
                  className="block text-xs font-bold text-molim-foreground mb-1.5"
                >
                  سبب {reasonModal.type === "decline" ? "الاعتذار" : "الانسحاب"} (إجباري – 10 أحرف كحد أدنى):
                </label>
                <textarea
                  id="reason-input"
                  rows={4}
                  value={reasonModal.reason}
                  onChange={(e) =>
                    setReasonModal((prev) => ({
                      ...prev,
                      reason: e.target.value,
                      error: null,
                    }))
                  }
                  disabled={reasonModal.isSubmitting}
                  placeholder="اكتب سبب القرار بوضوح..."
                  className="w-full p-3 rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)] disabled:opacity-60"
                />
              </div>

              {reasonModal.error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {reasonModal.error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeReasonModal}
                  disabled={reasonModal.isSubmitting}
                  className="text-xs px-4"
                >
                  إلغاء
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  onClick={handleConfirmReason}
                  disabled={reasonModal.isSubmitting}
                  className="text-xs px-4"
                >
                  {reasonModal.isSubmitting
                    ? "جاري المعالجة..."
                    : reasonModal.type === "decline"
                    ? "تأكيد الاعتذار"
                    : "تأكيد الانسحاب"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* نافذة إلغاء مهمة */}
        {cancelModal.isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
          >
            <div className="w-full max-w-lg rounded-xl bg-molim-surface border border-[var(--card-border)] p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h3 id="cancel-modal-title" className="text-lg font-bold text-molim-foreground">
                  تأكيد إلغاء المهمة
                </h3>
                <p className="text-xs text-molim-muted mt-1 break-words">
                  المهمة: {cancelModal.taskTitle}
                </p>
              </div>

              <div>
                <label
                  htmlFor="cancel-reason-input"
                  className="block text-xs font-bold text-molim-foreground mb-1.5"
                >
                  سبب الإلغاء (إجباري – 10 أحرف كحد أدنى):
                </label>
                <textarea
                  id="cancel-reason-input"
                  rows={4}
                  value={cancelModal.reason}
                  onChange={(e) =>
                    setCancelModal((prev) => ({
                      ...prev,
                      reason: e.target.value,
                      error: null,
                    }))
                  }
                  disabled={cancelModal.isSubmitting}
                  placeholder="اذكر سبب إلغاء هذه المهمة..."
                  className="w-full p-3 rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)] disabled:opacity-60"
                />
              </div>

              {cancelModal.error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {cancelModal.error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCancelModal}
                  disabled={cancelModal.isSubmitting}
                  className="text-xs px-4"
                >
                  تراجع
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  onClick={handleConfirmCancel}
                  disabled={cancelModal.isSubmitting}
                  className="text-xs px-4"
                >
                  {cancelModal.isSubmitting ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* نافذة إعادة توجيه المهمة */}
        {reassignModal.isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-modal-title"
          >
            <div className="w-full max-w-lg rounded-xl bg-molim-surface border border-[var(--card-border)] p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h3 id="reassign-modal-title" className="text-lg font-bold text-molim-foreground">
                  إعادة توجيه المهمة
                </h3>
                <p className="text-xs text-molim-muted mt-1 break-words">
                  المهمة: {reassignModal.taskTitle} (المعتذر سابقاً: {reassignModal.prevUserName})
                </p>
              </div>

              <div>
                <label
                  htmlFor="reassign-user-input"
                  className="block text-xs font-bold text-molim-foreground mb-1.5"
                >
                  رقم العضو الجديد (بصيغة MOL-XXXXX):
                </label>
                <input
                  id="reassign-user-input"
                  type="text"
                  value={reassignModal.targetUserId}
                  onChange={(e) =>
                    setReassignModal((prev) => ({
                      ...prev,
                      targetUserId: e.target.value,
                      error: null,
                    }))
                  }
                  disabled={reassignModal.isSubmitting}
                  placeholder="MOL-00000"
                  className="w-full p-3 rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)] disabled:opacity-60"
                />
              </div>

              {reassignModal.error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {reassignModal.error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeReassignModal}
                  disabled={reassignModal.isSubmitting}
                  className="text-xs px-4"
                >
                  إلغاء
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  onClick={handleConfirmReassign}
                  disabled={reassignModal.isSubmitting}
                  className="text-xs px-4"
                >
                  {reassignModal.isSubmitting ? "جاري الإرسال..." : "إعادة التوجيه"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* نافذة المراجعة (اعتماد / طلب تعديل / رفض نهائي) */}
        {reviewModal.isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
          >
            <div className="w-full max-w-lg rounded-xl bg-molim-surface border border-[var(--card-border)] p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h3 id="review-modal-title" className="text-lg font-bold text-molim-foreground">
                  {reviewModal.action === "approve"
                    ? "اعتماد تسليم المهمة"
                    : reviewModal.action === "revise"
                    ? "طلب تعديل على المهمة"
                    : "رفض نهائي للمهمة"}
                </h3>
                <p className="text-xs text-molim-muted mt-1 break-words">
                  المهمة: {reviewModal.taskTitle} | المنفذ: {reviewModal.volunteerName}
                </p>
              </div>

              {reviewModal.action === "approve" && (
                <div>
                  <label
                    htmlFor="review-hours-input"
                    className="block text-xs font-bold text-molim-foreground mb-1.5"
                  >
                    الساعات المعتمدة (من 0.25 إلى 24 بخطوات 0.25):
                  </label>
                  <input
                    id="review-hours-input"
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    value={reviewModal.hours}
                    onChange={(e) =>
                      setReviewModal((prev) => ({
                        ...prev,
                        hours: e.target.value,
                        error: null,
                      }))
                    }
                    disabled={reviewModal.isSubmitting}
                    className="w-full p-3 rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground text-xs focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)] disabled:opacity-60"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="review-notes-input"
                  className="block text-xs font-bold text-molim-foreground mb-1.5"
                >
                  {reviewModal.action === "approve"
                    ? "ملاحظات الاعتماد (اختيارية):"
                    : "ملاحظات القرار للمتطوع (إجباري – 10 أحرف كحد أدنى):"}
                </label>
                <textarea
                  id="review-notes-input"
                  rows={4}
                  value={reviewModal.notes}
                  onChange={(e) =>
                    setReviewModal((prev) => ({
                      ...prev,
                      notes: e.target.value,
                      error: null,
                    }))
                  }
                  disabled={reviewModal.isSubmitting}
                  placeholder={
                    reviewModal.action === "approve"
                      ? "اكتب أي تعليق أو ملاحظة تشجيعية..."
                      : "وضح بالتفصيل سبب الرفض أو المطلوب تعديله بدقة..."
                  }
                  className="w-full p-3 rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)] disabled:opacity-60"
                />
              </div>

              {reviewModal.error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {reviewModal.error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeReviewModal}
                  disabled={reviewModal.isSubmitting}
                  className="text-xs px-4"
                >
                  إلغاء
                </Button>

                <Button
                  type="button"
                  variant={
                    reviewModal.action === "approve"
                      ? "success"
                      : reviewModal.action === "revise"
                      ? "primary"
                      : "danger"
                  }
                  onClick={handleConfirmReview}
                  disabled={reviewModal.isSubmitting}
                  className="text-xs px-4"
                >
                  {reviewModal.isSubmitting
                    ? "جاري التنفيذ..."
                    : reviewModal.action === "approve"
                    ? "تأكيد الاعتماد"
                    : reviewModal.action === "revise"
                    ? "إرسال طلب التعديل"
                    : "تأكيد الرفض النهائي"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* نافذة إنشاء مهمة جديدة */}
        {isCreateOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
          >
            <div className="w-full sm:max-w-xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-xl bg-molim-surface border border-[var(--card-border)] shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3 sm:px-6 sm:py-4 bg-molim-surface shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--molim-orange)]" />
                  <h3 id="create-task-title" className="text-base font-bold text-molim-foreground">
                    إنشاء مهمة جديدة
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => !createSubmitting && setIsCreateOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-molim-muted hover:text-molim-foreground hover:bg-molim-soft transition-colors"
                  aria-label="إغلاق"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
                  {/* عنوان المهمة */}
                  <div>
                    <label
                      htmlFor="create-title"
                      className="block text-xs font-bold text-molim-foreground mb-1.5"
                    >
                      عنوان المهمة (إجباري – حتى 150 حرفاً):
                    </label>
                    <input
                      id="create-title"
                      type="text"
                      maxLength={150}
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      disabled={createSubmitting}
                      placeholder="مثال: إعداد تقرير الفعالية الشهرية"
                      className="w-full p-2.5 min-h-[42px] rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)]"
                    />
                  </div>

                  {/* الوصف */}
                  <div>
                    <label
                      htmlFor="create-desc"
                      className="block text-xs font-bold text-molim-foreground mb-1.5"
                    >
                      وصف المهمة (اختياري – حتى 2000 حرف):
                    </label>
                    <textarea
                      id="create-desc"
                      rows={3}
                      maxLength={2000}
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      disabled={createSubmitting}
                      placeholder="تفاصيل وإرشادات تنفيذ المهمة..."
                      className="w-full p-2.5 rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)] leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* الأولوية */}
                    <div>
                      <label
                        htmlFor="create-priority"
                        className="block text-xs font-bold text-molim-foreground mb-1.5"
                      >
                        الأولوية:
                      </label>
                      <select
                        id="create-priority"
                        value={createPriority}
                        onChange={(e) => setCreatePriority(e.target.value as "normal" | "urgent")}
                        disabled={createSubmitting}
                        className="w-full p-2.5 min-h-[42px] rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)]"
                      >
                        <option value="normal">عادية</option>
                        <option value="urgent">عاجلة</option>
                      </select>
                    </div>

                    {/* موعد الإنجاز */}
                    <div>
                      <label
                        htmlFor="create-due"
                        className="block text-xs font-bold text-molim-foreground mb-1.5"
                      >
                        الموعد النهائي (اختياري):
                      </label>
                      <input
                        id="create-due"
                        type="date"
                        value={createDueDate}
                        onChange={(e) => setCreateDueDate(e.target.value)}
                        disabled={createSubmitting}
                        className="w-full p-2.5 min-h-[42px] rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* عدد المنفذين */}
                    <div>
                      <label
                        htmlFor="create-assignees"
                        className="block text-xs font-bold text-molim-foreground mb-1.5"
                      >
                        عدد المنفذين المطلوب (1–50 أو اتركه فارغاً لبلا حد):
                      </label>
                      <input
                        id="create-assignees"
                        type="number"
                        min={1}
                        max={50}
                        value={createAssignees}
                        onChange={(e) => setCreateAssignees(e.target.value)}
                        disabled={createSubmitting}
                        placeholder="بلا حد"
                        className="w-full p-2.5 min-h-[42px] rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)]"
                      />
                    </div>

                    {/* نطاق المهمة */}
                    <div>
                      <label
                        htmlFor="create-scope"
                        className="block text-xs font-bold text-molim-foreground mb-1.5"
                      >
                        نطاق المهمة:
                      </label>
                      <select
                        id="create-scope"
                        value={createScope}
                        onChange={(e) => setCreateScope(e.target.value as TaskScopeOption)}
                        disabled={createSubmitting}
                        className="w-full p-2.5 min-h-[42px] rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)]"
                      >
                        {availableScopes.map((sc) => (
                          <option key={sc.value} value={sc.value}>
                            {sc.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* اختيار الأقسام إن كان النطاق departments */}
                  {createScope === "departments" && (
                    <div className="space-y-2.5 p-3 sm:p-4 rounded-lg bg-molim-soft border border-[var(--card-border)]">
                      <span className="block text-xs font-bold text-molim-foreground">
                        حدد الأقسام المستهدفة:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-0.5">
                        {allDepartments.map((d) => {
                          const checked = selectedDeptIds.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                checked
                                  ? "border-[var(--molim-orange)] bg-[var(--molim-orange)]/10 text-molim-foreground font-bold"
                                  : "border-[var(--card-border)] bg-molim text-molim-muted hover:bg-molim-surface"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDepartmentSelect(d.id)}
                                disabled={createSubmitting}
                                className="w-4 h-4 rounded border-[var(--card-border)] text-[var(--molim-orange)] focus:ring-0"
                              />
                              <span className="truncate">{d.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* إسناد لشخص محدد (لغير المتطوع فقط) */}
                  {isNonVolunteer && (
                    <div>
                      <label
                        htmlFor="create-target-user"
                        className="block text-xs font-bold text-molim-foreground mb-1.5"
                      >
                        إسناد لشخص محدد (اختياري – رقم العضو MOL-XXXXX):
                      </label>
                      <input
                        id="create-target-user"
                        type="text"
                        value={createTargetUserId}
                        onChange={(e) => setCreateTargetUserId(e.target.value)}
                        disabled={createSubmitting}
                        placeholder="مثال: MOL-00015"
                        className="w-full p-2.5 min-h-[42px] rounded-lg border border-[var(--card-border)] bg-molim text-molim-foreground placeholder:text-molim-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--molim-orange)]"
                      />
                      <span className="text-[11px] text-molim-muted mt-1 block">
                        عند التحديد لشخص آخر، يجب ألا يكون النطاق لنفسي.
                      </span>
                    </div>
                  )}

                  {createError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-600 dark:text-red-400">
                      {createError}
                    </div>
                  )}
                </div>

                {/* أزرار الإجراءات في أسفل النافذة */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 sm:px-6 sm:py-4 border-t border-[var(--card-border)] bg-molim-surface shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => !createSubmitting && setIsCreateOpen(false)}
                    disabled={createSubmitting}
                    className="w-full sm:w-auto text-xs py-2.5 px-4"
                  >
                    إلغاء
                  </Button>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={createSubmitting}
                    className="w-full sm:w-auto text-xs py-2.5 px-6 font-bold"
                  >
                    {createSubmitting ? "جاري الحفظ..." : "حفظ المهمة"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </PageShell>
    </RoleGuard>
  );
}
