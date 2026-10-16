"use client";

import { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import RoleGuard from "../components/RoleGuard";
import Card from "../components/Card";
import Button from "../components/Button";
import { useAuth } from "../lib/auth-context";

export type PendingHoursReviewItem = {
  id: string | number;
  user_id: string;
  user_name: string;
  user_number: string;
  department_id: string | null;
  department_name: string | null;
  task_id: string | null;
  submitted_hours: number;
  approved_hours: number | null;
  date: string;
  description: string;
  status: string;
  is_self_approved: boolean;
  created_at: string;
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

export default function HoursReviewPage() {
  const { isReady } = useAuth();

  const [items, setItems] = useState<PendingHoursReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // حالة النماذج المفتوحة لكل سجل
  const [approvedHoursMap, setApprovedHoursMap] = useState<Record<string | number, string>>({});
  const [notesMap, setNotesMap] = useState<Record<string | number, string>>({});
  const [activeActionMap, setActiveActionMap] = useState<
    Record<string | number, "approve" | "reject" | null>
  >({});
  const [itemErrorMap, setItemErrorMap] = useState<Record<string | number, string | null>>({});
  const [submittingMap, setSubmittingMap] = useState<Record<string | number, boolean>>({});

  const loadPendingHours = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const response = await fetch("/api/hours/review", {
      headers: authHeaders(),
    }).catch(() => null);

    if (!response) {
      setFetchError("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
      setLoading(false);
      return;
    }

    const data = await parseJson<{
      ok?: boolean;
      hours?: PendingHoursReviewItem[];
      error?: string;
    }>(response);

    if (!response.ok || !data?.ok) {
      setFetchError(data?.error ?? "تعذر جلب ساعات المراجعة.");
      setLoading(false);
      return;
    }

    const list = data.hours ?? [];
    setItems(list);

    // تهيئة الساعات المعتمدة بقيمة الساعات المقدمة
    const initialHours: Record<string | number, string> = {};
    for (const item of list) {
      initialHours[item.id] = String(item.submitted_hours);
    }
    setApprovedHoursMap((prev) => ({ ...initialHours, ...prev }));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isReady) {
      loadPendingHours();
    }
  }, [isReady, loadPendingHours]);

  function getApprovedHours(item: PendingHoursReviewItem): string {
    return approvedHoursMap[item.id] ?? String(item.submitted_hours);
  }

  function handleHoursChange(id: string | number, value: string) {
    setApprovedHoursMap((prev) => ({ ...prev, [id]: value }));
    setItemErrorMap((prev) => ({ ...prev, [id]: null }));
  }

  function handleNoteChange(id: string | number, value: string) {
    setNotesMap((prev) => ({ ...prev, [id]: value }));
    setItemErrorMap((prev) => ({ ...prev, [id]: null }));
  }

  function openActionForm(id: string | number, action: "approve" | "reject") {
    setActiveActionMap((prev) => ({
      ...prev,
      [id]: prev[id] === action ? null : action,
    }));
    setItemErrorMap((prev) => ({ ...prev, [id]: null }));
  }

  async function submitReview(item: PendingHoursReviewItem, action: "approve" | "reject") {
    const rawHoursStr = getApprovedHours(item);
    const note = (notesMap[item.id] ?? "").trim();
    const submittedHours = item.submitted_hours;

    // التحقق في الواجهة قبل الإرسال
    if (action === "approve") {
      const parsedHours = Number(rawHoursStr);
      if (Number.isNaN(parsedHours) || parsedHours < 0.25 || parsedHours > 24) {
        setItemErrorMap((prev) => ({
          ...prev,
          [item.id]: "الساعات المعتمدة يجب أن تكون بين 0.25 و 24 ساعة وبخطوات 0.25.",
        }));
        return;
      }

      // إذا اختلف الرقم عن المقدّم فالملاحظة إجبارية في الواجهة
      if (parsedHours !== submittedHours && !note) {
        setItemErrorMap((prev) => ({
          ...prev,
          [item.id]: "لقد قمت بتعديل عدد الساعات عن الساعات المقدمة، يرجى كتابة ملاحظة توضح سبب التعديل قبل الاعتماد.",
        }));
        return;
      }
    } else if (action === "reject") {
      if (!note) {
        setItemErrorMap((prev) => ({
          ...prev,
          [item.id]: "يرجى كتابة سبب الرفض (حقل إجباري).",
        }));
        return;
      }
    }

    setSubmittingMap((prev) => ({ ...prev, [item.id]: true }));
    setItemErrorMap((prev) => ({ ...prev, [item.id]: null }));

    const payload = {
      action,
      approvedHours: action === "approve" ? Number(rawHoursStr) : undefined,
      note: note || undefined,
    };

    const response = await fetch(`/api/hours/${encodeURIComponent(String(item.id))}/review`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!response) {
      setItemErrorMap((prev) => ({
        ...prev,
        [item.id]: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
      }));
      setSubmittingMap((prev) => ({ ...prev, [item.id]: false }));
      return;
    }

    const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(response);

    if (response.status === 409) {
      // عند 409 اعرض رسالة الخادم وأعد جلب القائمة
      setItemErrorMap((prev) => ({
        ...prev,
        [item.id]: data?.error ?? "تغيّرت حالة السجل أثناء المراجعة. جاري تحديث القائمة...",
      }));
      setSubmittingMap((prev) => ({ ...prev, [item.id]: false }));
      await loadPendingHours();
      return;
    }

    if (!response.ok || !data?.ok) {
      // عند 400 و 403 و 404 وباقي الأخطاء نعرض رسالة الخادم العربية كما هي
      setItemErrorMap((prev) => ({
        ...prev,
        [item.id]: data?.error ?? data?.message ?? "حدث خطأ أثناء معالجة الطلب.",
      }));
      setSubmittingMap((prev) => ({ ...prev, [item.id]: false }));
      return;
    }

    // عند النجاح أزل السجل من القائمة
    setItems((prev) => prev.filter((r) => r.id !== item.id));
    setSubmittingMap((prev) => ({ ...prev, [item.id]: false }));
    setActiveActionMap((prev) => ({ ...prev, [item.id]: null }));
  }

  return (
    <RoleGuard allowedRoles={["DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell>
        <div className="space-y-6">
          {/* ترويسة الصفحة */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-molim-foreground">
                مراجعة الساعات التطوعية
              </h1>
              <p className="mt-1 text-sm text-molim-muted">
                اعتماد أو رفض سجلات الساعات المرفوعة من قبل أعضاء الفريق.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={loadPendingHours}
              disabled={loading}
              className="text-xs"
            >
              {loading ? "جاري التحديث..." : "تحديث القائمة 🔄"}
            </Button>
          </div>

          {/* حالة التحميل */}
          {loading && (
            <div className="flex min-h-[40vh] items-center justify-center p-8">
              <div className="flex items-center gap-3 text-molim-muted">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-molim-orange border-t-transparent" />
                <span className="text-sm font-bold">جاري تحميل سجلات الساعات...</span>
              </div>
            </div>
          )}

          {/* حالة الخطأ العام */}
          {!loading && fetchError && (
            <Card className="border-r-4 border-r-red-500 p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-red-600">تعذر تحميل الساعات</h3>
                  <p className="mt-1 text-sm text-molim-muted">{fetchError}</p>
                  <Button
                    variant="primary"
                    onClick={loadPendingHours}
                    className="mt-4 text-xs"
                  >
                    إعادة المحاولة
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* حالة الفراغ */}
          {!loading && !fetchError && items.length === 0 && (
            <Card className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-molim-soft text-3xl">
                ✨
              </div>
              <h3 className="mt-4 text-lg font-black text-molim-foreground">
                لا توجد ساعات بانتظار المراجعة
              </h3>
              <p className="mt-1 text-sm text-molim-muted">
                تمت مراجعة جميع الساعات المتاحة لك أو لا توجد طلبات جديدة حالياً.
              </p>
            </Card>
          )}

          {/* قائمة السجلات */}
          {!loading && !fetchError && items.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-molim-muted">
                <span>عدد السجلات بانتظار المراجعة: {items.length}</span>
              </div>

              {items.map((item) => {
                const currentApprovedHours = getApprovedHours(item);
                const isHoursChanged = Number(currentApprovedHours) !== item.submitted_hours;
                const activeAction = activeActionMap[item.id] ?? null;
                const isSubmitting = submittingMap[item.id] ?? false;
                const itemError = itemErrorMap[item.id] ?? null;
                const noteValue = notesMap[item.id] ?? "";

                return (
                  <Card key={item.id} className="p-5">
                    {/* معلومات العضو والسجل */}
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-molim-foreground text-base">
                            {item.user_name}
                          </span>
                          <span className="rounded bg-molim-soft px-2 py-0.5 text-xs font-mono text-molim-muted">
                            {item.user_number}
                          </span>
                          {item.department_name && (
                            <span className="rounded bg-molim-orange/10 px-2 py-0.5 text-xs font-bold text-molim-orange">
                              {item.department_name}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-molim-muted">
                          <span>📅 تاريخ العمل: <strong className="text-molim-foreground">{item.date}</strong></span>
                          <span>🕒 الساعات المقدّمة: <strong className="text-molim-orange text-sm">{item.submitted_hours}</strong> ساعة</span>
                          {item.task_id && <span>📋 رقم المهمة: {item.task_id}</span>}
                        </div>

                        {item.description ? (
                          <div className="mt-2 rounded bg-molim-soft p-3 text-sm leading-6 text-molim-foreground">
                            <span className="font-semibold text-xs text-molim-muted block mb-1">وصف العمل:</span>
                            {item.description}
                          </div>
                        ) : (
                          <p className="text-xs text-molim-muted italic">لا يوجد وصف للعمل.</p>
                        )}
                      </div>

                      {/* أزرار الإجراء السريع */}
                      <div className="flex items-center gap-2 lg:flex-col lg:items-stretch">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => openActionForm(item.id, "approve")}
                          className={`rounded px-4 py-2 text-xs font-bold transition ${
                            activeAction === "approve"
                              ? "bg-green-600 text-white"
                              : "border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          ✓ اعتماد
                        </button>

                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => openActionForm(item.id, "reject")}
                          className={`rounded px-4 py-2 text-xs font-bold transition ${
                            activeAction === "reject"
                              ? "bg-red-600 text-white"
                              : "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          ✕ رفض
                        </button>
                      </div>
                    </div>

                    {/* رسالة الخطأ الخاصة بالسجل */}
                    {itemError && (
                      <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
                        {itemError}
                      </div>
                    )}

                    {/* لوحة نموذج الاعتماد */}
                    {activeAction === "approve" && (
                      <div className="mt-4 border-t border-molim pt-4 space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-bold text-molim-foreground mb-1">
                              الساعات المعتمدة (خطوات 0.25، من 0.25 إلى 24)
                            </label>
                            <input
                              type="number"
                              min="0.25"
                              max="24"
                              step="0.25"
                              disabled={isSubmitting}
                              value={currentApprovedHours}
                              onChange={(e) => handleHoursChange(item.id, e.target.value)}
                              className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                            />
                            {isHoursChanged && (
                              <p className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                تنبيه: تم تغيير عدد الساعات عن المقدّم ({item.submitted_hours} ساعة). كتابة ملاحظة توضيحية إجبارية.
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-molim-foreground mb-1">
                              ملاحظات المراجعة {isHoursChanged && <span className="text-red-500">* (إجبارية)</span>}
                            </label>
                            <input
                              type="text"
                              disabled={isSubmitting}
                              value={noteValue}
                              onChange={(e) => handleNoteChange(item.id, e.target.value)}
                              placeholder={
                                isHoursChanged
                                  ? "سبب تعديل الساعات (إجباري)..."
                                  : "ملاحظات إضافية (اختياري)..."
                              }
                              className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => openActionForm(item.id, "approve")}
                            className="rounded border border-molim px-4 py-2 text-xs font-semibold text-molim-muted hover:bg-molim-soft disabled:opacity-50"
                          >
                            إلغاء
                          </button>
                          <Button
                            variant="primary"
                            disabled={isSubmitting}
                            onClick={() => submitReview(item, "approve")}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white"
                          >
                            {isSubmitting ? "جاري الاعتماد..." : "تأكيد الاعتماد"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* لوحة نموذج الرفض */}
                    {activeAction === "reject" && (
                      <div className="mt-4 border-t border-molim pt-4 space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-molim-foreground mb-1">
                            سبب الرفض <span className="text-red-500">* (إجباري)</span>
                          </label>
                          <textarea
                            rows={2}
                            disabled={isSubmitting}
                            value={noteValue}
                            onChange={(e) => handleNoteChange(item.id, e.target.value)}
                            placeholder="اكتب سبب رفض الساعات بشكل واضح للعضو..."
                            className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => openActionForm(item.id, "reject")}
                            className="rounded border border-molim px-4 py-2 text-xs font-semibold text-molim-muted hover:bg-molim-soft disabled:opacity-50"
                          >
                            إلغاء
                          </button>
                          <Button
                            variant="primary"
                            disabled={isSubmitting}
                            onClick={() => submitReview(item, "reject")}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white"
                          >
                            {isSubmitting ? "جاري الرفض..." : "تأكيد الرفض"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </PageShell>
    </RoleGuard>
  );
}
