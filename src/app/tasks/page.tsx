"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageShell from "../components/PageShell";
import RoleGuard from "../components/RoleGuard";
import Card from "../components/Card";
import Button from "../components/Button";
import { useAuth } from "../lib/auth-context";

export type TaskItem = {
  id: string | number;
  title: string;
  description: string | null;
  target_type: string;
  target_user_id: string | null;
  target_department_ids: string[] | unknown;
  department_id: string | null;
  department_name: string | null;
  status: string;
  requested_hours: number | null;
  due_date: string | null;
  created_by: string;
  creator_name: string;
  creator_number: string;
  assigned_to: string | null;
  review_decision?: string | null;
  review_reason?: string | null;
  created_at: string;
  updated_at: string;
};

type TaskStatusFilter = "الكل" | "قيد التنفيذ" | "قيد المراجعة" | "مكتملة" | "متوقفة";

const statusFilterOptions: TaskStatusFilter[] = [
  "الكل",
  "قيد التنفيذ",
  "قيد المراجعة",
  "مكتملة",
  "متوقفة",
];

function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initData || null;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const initData = telegramInitData();
  return {
    ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
    ...(extra ?? {}),
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getArabicStatus(status: string): string {
  switch (status) {
    case "in_progress":
      return "قيد التنفيذ";
    case "in_review":
      return "قيد المراجعة";
    case "completed":
      return "مكتملة";
    case "paused":
      return "متوقفة";
    default:
      return status;
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case "in_progress":
      return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-950/40 dark:text-yellow-300";
    case "in_review":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300";
    case "completed":
      return "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-300";
    case "paused":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300";
    default:
      return "border-molim bg-molim-soft text-molim-muted";
  }
}

function getArabicScope(task: TaskItem): string {
  switch (task.target_type) {
    case "self":
      return "لنفسه";
    case "department":
      return task.department_name ? `لقسم ${task.department_name}` : "لقسم محدد";
    case "multiple_departments": {
      const count = Array.isArray(task.target_department_ids) ? task.target_department_ids.length : 0;
      return count > 0 ? `لعدة أقسام (${count} أقسام)` : "لعدة أقسام";
    }
    case "all_departments":
      return "لجميع الأقسام";
    default:
      return task.target_type || "عام";
  }
}

export default function TasksPage() {
  const { user, role, isReady } = useAuth();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<TaskStatusFilter>("الكل");
  const [scopeFilter, setScopeFilter] = useState<"my_tasks" | "all_tasks">("my_tasks");

  // تسليم المهمة
  const [submittingTask, setSubmittingTask] = useState<TaskItem | null>(null);
  const [submitHours, setSubmitHours] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitLinks, setSubmitLinks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isManager = role === "DEPARTMENT_HEAD" || role === "HR" || role === "ADMIN" || role === "SUPER_ADMIN";

  const isPersonalTask = useCallback(
    (task: TaskItem) => {
      return (
        task.target_user_id === user.id ||
        task.assigned_to === user.id ||
        (task.target_type === "self" && task.created_by === user.id) ||
        (!task.target_user_id && !task.assigned_to && task.created_by === user.id)
      );
    },
    [user.id]
  );

  const myTasksCount = useMemo(() => {
    return tasks.filter(isPersonalTask).length;
  }, [tasks, isPersonalTask]);

  const teamTasksCount = useMemo(() => {
    return tasks.length;
  }, [tasks]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const response = await fetch("/api/tasks", {
      headers: authHeaders(),
    }).catch(() => null);

    if (!response) {
      setFetchError("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
      setLoading(false);
      return;
    }

    const data = await parseJson<{ ok?: boolean; tasks?: TaskItem[]; error?: string }>(response);

    if (!response.ok || !data?.ok) {
      setFetchError(data?.error ?? "تعذر جلب قائمة المهام.");
      setLoading(false);
      return;
    }

    setTasks(data.tasks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isReady) {
      loadTasks();
    }
  }, [isReady, loadTasks]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (scopeFilter === "my_tasks") {
      list = list.filter(isPersonalTask);
    }
    if (activeStatus === "الكل") return list;
    return list.filter((task) => getArabicStatus(task.status) === activeStatus);
  }, [tasks, scopeFilter, activeStatus, isPersonalTask]);

  function openSubmitModal(task: TaskItem) {
    setSubmittingTask(task);
    setSubmitHours(task.requested_hours ? String(task.requested_hours) : "1");
    setSubmitNotes("");
    setSubmitLinks("");
    setSubmitError(null);
  }

  function closeSubmitModal() {
    setSubmittingTask(null);
    setSubmitError(null);
  }

  async function handleSubmitCompletion(e: React.FormEvent) {
    e.preventDefault();
    if (!submittingTask) return;
    setSubmitError(null);

    const hoursNum = Number(submitHours);
    if (
      Number.isNaN(hoursNum) ||
      hoursNum < 0.25 ||
      hoursNum > 24 ||
      Math.abs(hoursNum * 4 - Math.round(hoursNum * 4)) > 1e-6
    ) {
      setSubmitError("الساعات المستغرقة يجب أن تكون بين 0.25 و 24 وبخطوات 0.25.");
      return;
    }

    const trimmedNotes = submitNotes.trim();
    if (!trimmedNotes) {
      setSubmitError("يرجى كتابة وصف موجز لما قمت بإنجازه.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/tasks/${encodeURIComponent(String(submittingTask.id))}/submit`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        hours: hoursNum,
        notes: trimmedNotes,
        links: submitLinks.trim() || undefined,
      }),
    }).catch(() => null);

    if (!response) {
      setSubmitError("تعذر الاتصال بالخادم.");
      setIsSubmitting(false);
      return;
    }

    const data = await parseJson<{ ok?: boolean; message?: string; error?: string }>(response);

    if (!response.ok || !data?.ok) {
      setSubmitError(data?.error ?? "حدث خطأ أثناء تسليم المهمة.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeSubmitModal();
    setSuccessToast("تم تسليم المهمة بنجاح وتحويلها لمراجعة المسؤولين! 🚀");
    setTimeout(() => setSuccessToast(null), 5000);
    await loadTasks();
  }

  return (
    <RoleGuard allowedRoles={["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell>
        <div className="space-y-6">
          {/* نجاح الإرسال */}
          {successToast && (
            <div className="rounded border border-green-200 bg-green-50 p-4 text-xs font-bold text-green-800">
              {successToast}
            </div>
          )}

          {/* ترويسة الصفحة */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-bold text-molim-orange">إدارة العمل</span>
              <h1 className="mt-1 text-2xl font-black text-molim-foreground">
                المهام
              </h1>
              <p className="mt-1 text-sm text-molim-muted">
                استعراض المهام وإنجازها ورفع المخرجات لاعتماد الساعات التطوعية.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={loadTasks}
                disabled={loading}
                className="text-xs"
              >
                {loading ? "جاري التحديث..." : "تحديث 🔄"}
              </Button>

              {isManager && (
                <Link href="/task-review">
                  <Button variant="secondary" className="text-xs bg-molim-orange/15 text-molim-orange border-molim-orange/30 hover:bg-molim-orange/25">
                    📋 مراجعة المهام
                  </Button>
                </Link>
              )}

              <Link href="/add-task">
                <Button variant="primary" className="text-xs">
                  + إضافة مهمة
                </Button>
              </Link>
            </div>
          </div>

          {/* تبويب النطاق: مهامي الخاصة مقابل مهام الفريق */}
          <div className="flex border-b border-molim gap-2">
            <button
              type="button"
              onClick={() => setScopeFilter("my_tasks")}
              className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 ${
                scopeFilter === "my_tasks"
                  ? "border-molim-orange text-molim-orange"
                  : "border-transparent text-molim-muted hover:text-molim-foreground"
              }`}
            >
              👤 مهامي الخاصة ({myTasksCount})
            </button>
            {isManager && (
              <button
                type="button"
                onClick={() => setScopeFilter("all_tasks")}
                className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 ${
                  scopeFilter === "all_tasks"
                    ? "border-molim-orange text-molim-orange"
                    : "border-transparent text-molim-muted hover:text-molim-foreground"
                }`}
              >
                👥 مهام الفريق والأقسام ({teamTasksCount})
              </button>
            )}
          </div>

          {/* فلاتر الحالة */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-molim-muted shrink-0 ml-1">تصفية حسب:</span>
            {statusFilterOptions.map((filter) => {
              const selected = activeStatus === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveStatus(filter)}
                  className={`shrink-0 rounded border px-3 py-1.5 text-xs font-bold transition ${
                    selected
                      ? "border-molim-orange bg-molim-orange text-white"
                      : "border-molim bg-molim-surface text-molim-muted hover:border-molim-orange"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {/* حالة التحميل */}
          {loading && (
            <div className="flex min-h-[40vh] items-center justify-center p-8">
              <div className="flex items-center gap-3 text-molim-muted">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-molim-orange border-t-transparent" />
                <span className="text-sm font-bold">جاري تحميل المهام...</span>
              </div>
            </div>
          )}

          {/* حالة الخطأ */}
          {!loading && fetchError && (
            <Card className="border-r-4 border-r-red-500 p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-red-600">تعذر تحميل المهام</h3>
                  <p className="mt-1 text-sm text-molim-muted">{fetchError}</p>
                  <Button
                    variant="primary"
                    onClick={loadTasks}
                    className="mt-4 text-xs"
                  >
                    إعادة المحاولة
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* حالة الفراغ */}
          {!loading && !fetchError && filteredTasks.length === 0 && (
            <Card className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-molim-soft text-3xl">
                📋
              </div>
              <h3 className="mt-4 text-lg font-black text-molim-foreground">
                لا توجد مهام
              </h3>
              <p className="mt-1 text-sm text-molim-muted">
                {activeStatus === "الكل"
                  ? scopeFilter === "my_tasks"
                    ? "لا توجد لديك مهام خاصة مسندة إليك حالياً."
                    : "لم يتم العثور على أي مهام مسندة لقسمك أو الفريق حالياً."
                  : `لا توجد مهام بحالة «${activeStatus}».`}
              </p>
              <div className="mt-5">
                <Link href="/add-task">
                  <Button variant="primary" className="text-xs">
                    + إنشاء مهمة جديدة
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* قائمة المهام */}
          {!loading && !fetchError && filteredTasks.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-molim-muted">
                <span>إجمالي المهام المعروضة: {filteredTasks.length}</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredTasks.map((task) => {
                  const arabicStatus = getArabicStatus(task.status);
                  const statusStyle = getStatusStyle(task.status);
                  const arabicScope = getArabicScope(task);
                  const isOwner = task.created_by === user.id || task.assigned_to === user.id;

                  return (
                    <Card key={task.id} className="p-5">
                      <div className="flex flex-col gap-3">
                        {/* العنوان والحالة */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-base font-black text-molim-foreground">
                              {task.title}
                            </h2>
                            {task.description && (
                              <p className="mt-2 text-xs leading-6 text-molim-muted whitespace-pre-wrap">
                                {task.description}
                              </p>
                            )}
                          </div>

                          <span
                            className={`shrink-0 rounded border px-2.5 py-1 text-xs font-bold ${statusStyle}`}
                          >
                            {arabicStatus}
                          </span>
                        </div>

                        {/* تنبيه إذا كانت المهمة مرفوضة أو بها ملاحظات مراجعة */}
                        {task.review_decision === "rejected" && task.review_reason && (
                          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                            <span className="font-bold block mb-0.5">⚠️ ملاحظات المراجع للتعديل:</span>
                            {task.review_reason}
                          </div>
                        )}

                        {/* معلومات المهمة: المنشئ، النطاق، الساعات، الاستحقاق */}
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-molim pt-3 text-xs sm:grid-cols-4">
                          <div className="rounded bg-molim-soft p-2.5">
                            <span className="block text-[11px] text-molim-muted">أنشأها:</span>
                            <span className="font-bold text-molim-foreground truncate block mt-0.5">
                              {task.creator_name}
                            </span>
                            <span className="font-mono text-[10px] text-molim-muted">
                              ({task.creator_number})
                            </span>
                          </div>

                          <div className="rounded bg-molim-soft p-2.5">
                            <span className="block text-[11px] text-molim-muted">النطاق:</span>
                            <span className="font-bold text-molim-orange block mt-0.5">
                              {arabicScope}
                            </span>
                          </div>

                          <div className="rounded bg-molim-soft p-2.5">
                            <span className="block text-[11px] text-molim-muted">الساعات التقديرية:</span>
                            <span className="font-bold text-molim-foreground block mt-0.5">
                              {task.requested_hours !== null ? `${task.requested_hours} ساعة` : "غير محدد"}
                            </span>
                          </div>

                          <div className="rounded bg-molim-soft p-2.5">
                            <span className="block text-[11px] text-molim-muted">تاريخ الاستحقاق:</span>
                            <span className="font-bold text-molim-foreground block mt-0.5">
                              {task.due_date ? task.due_date : "غير محدد"}
                            </span>
                          </div>
                        </div>

                        {/* زر تسليم المهمة */}
                        {task.status === "in_progress" &&
                          (isPersonalTask(task) || !task.target_user_id) && (
                            <div className="mt-2 flex items-center justify-end border-t border-molim pt-3">
                              <Button
                                type="button"
                                variant="primary"
                                onClick={() => openSubmitModal(task)}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white"
                              >
                                🚀 تسليم المهمة وطلب اعتماد الساعات
                              </Button>
                            </div>
                          )}

                        {task.status === "in_review" && (
                          <div className="mt-2 rounded bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 flex items-center justify-between">
                            <span>⏳ تم تسليم المهمة وهي قيد المراجعة حالياً من قبل الإدارة.</span>
                            {isManager && (
                              <Link href="/task-review" className="font-bold underline mr-2">
                                الانتقال لمراجعتها ←
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* نافذة تسليم المهمة */}
        {submittingTask && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !isSubmitting) {
                closeSubmitModal();
              }
            }}
          >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-molim-surface p-6 shadow-2xl border border-molim">
              <div className="flex items-start justify-between gap-3 border-b border-molim pb-4">
                <div>
                  <span className="text-xs font-bold text-molim-orange">تسليم إنجاز</span>
                  <h2 className="mt-1 text-lg font-black text-molim-foreground">
                    {submittingTask.title}
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={closeSubmitModal}
                  className="rounded-xl bg-molim-soft px-3 py-1.5 text-xs font-bold text-molim-muted hover:text-molim-foreground"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitCompletion} className="mt-5 space-y-4">
                {submitError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                    ⚠️ {submitError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-molim-foreground mb-1">
                    عدد الساعات المستغرقة الفعلية (خطوات 0.25)
                  </label>
                  <input
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    required
                    disabled={isSubmitting}
                    value={submitHours}
                    onChange={(e) => setSubmitHours(e.target.value)}
                    placeholder="مثال: 3"
                    className="w-full rounded border border-molim bg-molim-soft px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                  />
                  <p className="mt-1 text-[11px] text-molim-muted">
                    ستُحتسب هذه الساعات رسمياً في رصيدك التطوعي بعد مراجعتها واعتمادها.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-molim-foreground mb-1">
                    وصف ما تم إنجازه <span className="text-red-500">* (إجباري)</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    disabled={isSubmitting}
                    value={submitNotes}
                    onChange={(e) => setSubmitNotes(e.target.value)}
                    placeholder="اكتب تفاصيل ما قمت بعمله لإنجاز هذه المهمة..."
                    className="w-full rounded border border-molim bg-molim-soft p-3 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-molim-foreground mb-1">
                    روابط المخرجات أو المرفقات (اختياري)
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={submitLinks}
                    onChange={(e) => setSubmitLinks(e.target.value)}
                    placeholder="رابط Google Drive، Figma، GitHub، أو أي رابط خارجي..."
                    className="w-full rounded border border-molim bg-molim-soft px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSubmitting ? "جاري التسليم..." : "إرسال المهمة للمراجعة ✅"}
                  </Button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={closeSubmitModal}
                    className="rounded border border-molim px-4 py-2 text-xs font-semibold text-molim-muted hover:bg-molim-soft"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </PageShell>
    </RoleGuard>
  );
}