"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageShell from "../components/PageShell";
import RoleGuard from "../components/RoleGuard";
import { useAuth } from "../lib/auth-context";
import { ROLE_NAMES } from "../lib/roles";

export type PendingReviewTask = {
  id: string | number;
  title: string;
  description: string | null;
  department_id: string | null;
  department_name: string;
  volunteer_id: string;
  volunteer_name: string;
  volunteer_number: string;
  submitted_hours: number;
  submission_notes: string;
  submission_date: string;
  hours_log_id: string | number | null;
  created_at: string;
  updated_at: string;
};

type ReviewedTaskLog = {
  id: string | number;
  title: string;
  volunteer: string;
  hours: number;
  decision: "معتمدة" | "مرفوضة";
  reason: string;
};

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

export default function TaskReviewPage() {
  const { user: currentUser, isReady } = useAuth();
  const roleName = ROLE_NAMES[currentUser.role];

  const [tasks, setTasks] = useState<PendingReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [hoursInput, setHoursInput] = useState<Record<string | number, string>>({});
  const [rejectingId, setRejectingId] = useState<string | number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingMap, setSubmittingMap] = useState<Record<string | number, boolean>>({});
  const [actionErrorMap, setActionErrorMap] = useState<Record<string | number, string | null>>({});

  const [completedReviews, setCompletedReviews] = useState<ReviewedTaskLog[]>([]);

  const loadPendingTasks = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const response = await fetch("/api/tasks/review", {
      headers: authHeaders(),
    }).catch(() => null);

    if (!response) {
      setFetchError("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
      setLoading(false);
      return;
    }

    const data = await parseJson<{
      ok?: boolean;
      tasks?: PendingReviewTask[];
      error?: string;
    }>(response);

    if (!response.ok || !data?.ok) {
      setFetchError(data?.error ?? "تعذر جلب مهام المراجعة.");
      setLoading(false);
      return;
    }

    const list = data.tasks ?? [];
    setTasks(list);

    const initialHours: Record<string | number, string> = {};
    for (const task of list) {
      initialHours[task.id] = String(task.submitted_hours);
    }
    setHoursInput((prev) => ({ ...initialHours, ...prev }));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isReady) {
      loadPendingTasks();
    }
  }, [isReady, loadPendingTasks]);

  function getHoursValue(task: PendingReviewTask) {
    return hoursInput[task.id] ?? String(task.submitted_hours);
  }

  function setHours(taskId: string | number, value: string) {
    setHoursInput((current) => ({
      ...current,
      [taskId]: value,
    }));
    setActionErrorMap((prev) => ({ ...prev, [taskId]: null }));
  }

  async function approveTask(task: PendingReviewTask) {
    const rawVal = getHoursValue(task);
    const entered = Number(rawVal);

    if (
      Number.isNaN(entered) ||
      entered < 0.25 ||
      entered > 24 ||
      Math.abs(entered * 4 - Math.round(entered * 4)) > 1e-6
    ) {
      setActionErrorMap((prev) => ({
        ...prev,
        [task.id]: "الساعات المعتمدة يجب أن تكون بين 0.25 و 24 وبخطوات 0.25.",
      }));
      return;
    }

    setSubmittingMap((prev) => ({ ...prev, [task.id]: true }));
    setActionErrorMap((prev) => ({ ...prev, [task.id]: null }));

    const response = await fetch(`/api/tasks/${encodeURIComponent(String(task.id))}/review`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        action: "approve",
        approvedHours: entered,
        note: entered !== task.submitted_hours ? `تعديل الساعات إلى ${entered} ساعة` : undefined,
      }),
    }).catch(() => null);

    if (!response) {
      setActionErrorMap((prev) => ({
        ...prev,
        [task.id]: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
      }));
      setSubmittingMap((prev) => ({ ...prev, [task.id]: false }));
      return;
    }

    const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(response);

    if (!response.ok || !data?.ok) {
      setActionErrorMap((prev) => ({
        ...prev,
        [task.id]: data?.error ?? data?.message ?? "حدث خطأ أثناء اعتماد المهمة.",
      }));
      setSubmittingMap((prev) => ({ ...prev, [task.id]: false }));
      return;
    }

    setCompletedReviews((current) => [
      {
        id: task.id,
        title: task.title,
        volunteer: task.volunteer_name,
        hours: entered,
        decision: "معتمدة",
        reason: "",
      },
      ...current,
    ]);

    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSubmittingMap((prev) => ({ ...prev, [task.id]: false }));
  }

  function requestReject(task: PendingReviewTask) {
    setRejectingId(task.id);
    setRejectReason("");
    setActionErrorMap((prev) => ({ ...prev, [task.id]: null }));
  }

  function cancelReject() {
    setRejectingId(null);
    setRejectReason("");
  }

  async function confirmReject(task: PendingReviewTask) {
    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      setActionErrorMap((prev) => ({
        ...prev,
        [task.id]: "يرجى كتابة سبب الرفض أو الملاحظات ليعود للمتطوع.",
      }));
      return;
    }

    setSubmittingMap((prev) => ({ ...prev, [task.id]: true }));
    setActionErrorMap((prev) => ({ ...prev, [task.id]: null }));

    const response = await fetch(`/api/tasks/${encodeURIComponent(String(task.id))}/review`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        action: "reject",
        reason: trimmedReason,
      }),
    }).catch(() => null);

    if (!response) {
      setActionErrorMap((prev) => ({
        ...prev,
        [task.id]: "تعذر الاتصال بالخادم.",
      }));
      setSubmittingMap((prev) => ({ ...prev, [task.id]: false }));
      return;
    }

    const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(response);

    if (!response.ok || !data?.ok) {
      setActionErrorMap((prev) => ({
        ...prev,
        [task.id]: data?.error ?? data?.message ?? "تعذر رفض المهمة.",
      }));
      setSubmittingMap((prev) => ({ ...prev, [task.id]: false }));
      return;
    }

    setCompletedReviews((current) => [
      {
        id: task.id,
        title: task.title,
        volunteer: task.volunteer_name,
        hours: task.submitted_hours,
        decision: "مرفوضة",
        reason: trimmedReason,
      },
      ...current,
    ]);

    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSubmittingMap((prev) => ({ ...prev, [task.id]: false }));
    cancelReject();
  }

  return (
    <RoleGuard allowedRoles={["DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell>
        <div className="space-y-6">
          {/* ترويسة الصفحة */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-bold text-molim-orange">{roleName}</span>
              <h1 className="mt-1 text-2xl font-black text-molim-foreground">
                مراجعة المهام
              </h1>
              <p className="mt-1 text-sm text-molim-muted">
                مراجعة تفاصيل مخرجات المهام المرفوعة من المتطوعين واعتماد الساعات المستحقة رسمياً.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadPendingTasks}
                disabled={loading}
                className="text-xs"
              >
                {loading ? "جاري التحديث..." : "تحديث القائمة 🔄"}
              </Button>

              <Link href="/tasks">
                <Button variant="secondary" className="text-xs">
                  ← صفحة المهام
                </Button>
              </Link>
            </div>
          </div>

          {/* حالة التحميل */}
          {loading && (
            <div className="flex min-h-[40vh] items-center justify-center p-8">
              <div className="flex items-center gap-3 text-molim-muted">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-molim-orange border-t-transparent" />
                <span className="text-sm font-bold">جاري تحميل طلبات مراجعة المهام...</span>
              </div>
            </div>
          )}

          {/* حالة الخطأ العام */}
          {!loading && fetchError && (
            <Card className="border-r-4 border-r-red-500 p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-red-600">تعذر تحميل المهام للمراجعة</h3>
                  <p className="mt-1 text-sm text-molim-muted">{fetchError}</p>
                  <Button
                    variant="primary"
                    onClick={loadPendingTasks}
                    className="mt-4 text-xs"
                  >
                    إعادة المحاولة
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* حالة الفراغ */}
          {!loading && !fetchError && tasks.length === 0 && (
            <Card className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-molim-soft text-3xl">
                ✨
              </div>
              <h3 className="mt-4 text-lg font-black text-molim-foreground">
                لا توجد مهام بانتظار المراجعة
              </h3>
              <p className="mt-1 text-sm text-molim-muted">
                تمت مراجعة جميع المهام المسلّمة المتاحة لك أو لا توجد مهام جديدة حالياً.
              </p>
            </Card>
          )}

          {/* قائمة المهام المعلقة */}
          {!loading && !fetchError && tasks.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-molim-muted">
                <span>طلبات الإنجاز بانتظار المراجعة: {tasks.length}</span>
              </div>

              {tasks.map((task) => {
                const isSubmitting = submittingMap[task.id] ?? false;
                const actionError = actionErrorMap[task.id] ?? null;

                return (
                  <Card key={task.id} className="p-5">
                    {/* رأس بطاقة المهمة */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <span className="rounded bg-molim-soft px-2 py-0.5 text-xs text-molim-muted">
                          قسم: {task.department_name}
                        </span>
                        <h2 className="mt-1 text-lg font-black text-molim-foreground">
                          {task.title}
                        </h2>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-molim-foreground">
                            المتطوع: {task.volunteer_name}
                          </span>
                          {task.volunteer_number && (
                            <span className="font-mono text-molim-muted">
                              ({task.volunteer_number})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-left sm:text-right">
                        <span className="border border-molim bg-molim-soft px-2.5 py-1 text-xs text-molim-muted">
                          تاريخ التسليم: {task.submission_date || "اليوم"}
                        </span>
                        <p className="mt-1.5 text-sm font-black text-molim-orange">
                          الساعات المطلوبة: {task.submitted_hours} ساعة
                        </p>
                      </div>
                    </div>

                    {/* متطلبات المهمة الأساسية */}
                    {task.description && (
                      <div className="mt-3 rounded bg-molim-soft/50 p-3 text-xs text-molim-muted border border-molim">
                        <span className="font-bold block mb-1">المطلوب من المهمة:</span>
                        <p className="whitespace-pre-wrap">{task.description}</p>
                      </div>
                    )}

                    {/* ما أنجزه المتطوع مع الروابط والمرفقات */}
                    <div className="mt-3 rounded bg-molim-soft p-3.5 text-sm border border-molim">
                      <span className="font-bold text-xs text-molim-muted block mb-1">
                        تفاصيل إنجاز المتطوع ومخرجات العمل:
                      </span>
                      <p className="leading-6 text-molim-foreground whitespace-pre-wrap">
                        {task.submission_notes || "تم تسليم العمل بنجاح."}
                      </p>
                    </div>

                    {/* رسالة الخطأ إن وجدت */}
                    {actionError && (
                      <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                        {actionError}
                      </div>
                    )}

                    {/* لوحة القرار والاعتماد */}
                    <div className="mt-4 border-t border-molim pt-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-bold text-molim-foreground mb-1">
                            الساعات المعتمدة (قابلة للتعديل عند الحاجة)
                          </label>
                          <input
                            type="number"
                            min="0.25"
                            max="24"
                            step="0.25"
                            disabled={isSubmitting}
                            value={getHoursValue(task)}
                            onChange={(e) => setHours(task.id, e.target.value)}
                            className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                          />
                        </div>

                        <div className="flex items-end gap-2">
                          <Button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => approveTask(task)}
                            className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                          >
                            {isSubmitting ? "جاري الاعتماد..." : "✅ اعتماد المهمة والساعات"}
                          </Button>

                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isSubmitting}
                            onClick={() => requestReject(task)}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white"
                          >
                            ❌ رفض / طلب تعديل
                          </Button>
                        </div>
                      </div>

                      {/* نافذة أو لوحة الرفض مع السبب */}
                      {rejectingId === task.id && (
                        <div className="rounded border border-red-200 bg-red-50 p-4 space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-red-700 mb-1">
                              سبب الرفض أو التعديلات المطلوبة من المتطوع (إجباري):
                            </label>
                            <textarea
                              rows={2}
                              disabled={isSubmitting}
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="اكتب التوجيهات أو سبب الرفض ليعود للمتطوع..."
                              className="w-full rounded border border-red-300 bg-white p-3 text-xs text-red-900 focus:outline-none focus:border-red-500"
                            />
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={cancelReject}
                              disabled={isSubmitting}
                              className="text-xs"
                            >
                              إلغاء
                            </Button>
                            <Button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => confirmReject(task)}
                              className="text-xs bg-red-600 hover:bg-red-700 text-white"
                            >
                              {isSubmitting ? "جاري الإرسال..." : "تأكيد الرفض وإعادة المهمة"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* قائمة المهام التي روجعت في هذه الجلسة */}
          {completedReviews.length > 0 && (
            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-between text-xs text-molim-muted">
                <h3 className="font-bold text-sm text-molim-foreground">تمت مراجعتها مؤخراً:</h3>
                <span>{completedReviews.length} مهمة</span>
              </div>

              <div className="space-y-2">
                {completedReviews.map((log) => (
                  <Card key={log.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-molim-foreground">{log.title}</p>
                      <p className="text-molim-muted mt-0.5">{log.volunteer}</p>
                      {log.reason && (
                        <p className="text-red-600 mt-1">السبب: {log.reason}</p>
                      )}
                    </div>

                    <span
                      className={`rounded px-2.5 py-1 font-bold ${
                        log.decision === "معتمدة"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {log.decision === "معتمدة"
                        ? `معتمدة (${log.hours} ساعة)`
                        : "مرفوضة"}
                    </span>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageShell>
    </RoleGuard>
  );
}