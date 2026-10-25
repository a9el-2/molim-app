"use client";

import { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import PageTitle from "../components/PageTitle";
import RoleGuard from "../components/RoleGuard";
import Card from "../components/Card";
import Button from "../components/Button";

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

type TabType = "my-tasks" | "available" | "created";

type ReasonModalState = {
  isOpen: boolean;
  type: "decline" | "withdraw";
  assignmentId: string;
  taskTitle: string;
  reason: string;
  error: string | null;
  isSubmitting: boolean;
};

// ─────────────────────────────────────────────────────────────
// دوال مساعدة لترويسات تيليجرام والتاريخ
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
  const [activeTab, setActiveTab] = useState<TabType>("my-tasks");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [createdTasks, setCreatedTasks] = useState<CreatedTask[]>([]);

  // حالة تنفيذ العمليات السريعة (مثل قبول أو تسليم)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; error?: string; success?: string } | null>(null);

  // نافذة السبب الإجباري
  const [reasonModal, setReasonModal] = useState<ReasonModalState>({
    isOpen: false,
    type: "decline",
    assignmentId: "",
    taskTitle: "",
    reason: "",
    error: null,
    isSubmitting: false,
  });

  const todayRiyadh = getTodayRiyadh();

  // جلب البيانات مرة واحدة من الخادم
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // فتح نافذة السبب الإجباري للإجراء السلبي
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

  // تأكيد إرسال الاعتذار أو الانسحاب
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

  return (
    <RoleGuard allowedRoles={["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell>
        <PageTitle
          title="المهام والعمل"
          category="متابعة وإدارة المهام"
          description="متابعة التكليفات المسندة إليك، استلام المهام المتاحة، واستعراض المهام التي أنشأتها."
        />

        {/* شريط التبويبات */}
        <div className="border-b border-[var(--card-border)] mb-6">
          <nav className="flex space-x-6 space-x-reverse" aria-label="تبويبات العمل">
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
          </nav>
        </div>

        {/* حالة التحميل */}
        {loading && (
          <div className="py-16 text-center text-molim-muted">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-molim border-t-[var(--molim-orange)] mb-3" />
            <p className="text-sm font-bold">جاري تحميل قائمة المهام...</p>
          </div>
        )}

        {/* حالة الخطأ */}
        {!loading && errorMsg && (
          <div className="py-12 text-center space-y-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
            <Button variant="outline" onClick={loadData}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* محتوى التبويبات عند اكتمال الجلب */}
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

                        {/* إشعارات الإجراء الخاصة بالبطاقة */}
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
                        </div>

                        {/* شارات السجلات المرفوضة لمهام الأفراد */}
                        {declined.length > 0 && (
                          <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                            <p className="text-xs font-bold text-red-600 dark:text-red-400">
                              اعتذارات عن التكليف:
                            </p>

                            {declined.map((d) => (
                              <div
                                key={d.id}
                                className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-molim-foreground space-y-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold">
                                    العضو: {d.user_id}
                                  </span>
                                  <span className="text-[11px] font-bold text-red-700 dark:text-red-300">
                                    مرفوضة
                                  </span>
                                </div>
                                {d.status_reason && (
                                  <p className="text-molim-muted">السبب: {d.status_reason}</p>
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
                <h3
                  id="reason-modal-title"
                  className="text-lg font-bold text-molim-foreground"
                >
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
      </PageShell>
    </RoleGuard>
  );
}
