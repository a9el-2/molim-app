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
  const { isReady } = useAuth();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<TaskStatusFilter>("الكل");

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
    if (activeStatus === "الكل") return tasks;
    return tasks.filter((task) => getArabicStatus(task.status) === activeStatus);
  }, [tasks, activeStatus]);

  return (
    <RoleGuard allowedRoles={["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell>
        <div className="space-y-6">
          {/* ترويسة الصفحة */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-bold text-molim-orange">إدارة العمل</span>
              <h1 className="mt-1 text-2xl font-black text-molim-foreground">
                المهام
              </h1>
              <p className="mt-1 text-sm text-molim-muted">
                استعراض ومتابعة المهام المسندة والمهام الخاصة بالقسم.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={loadTasks}
                disabled={loading}
                className="text-xs"
              >
                {loading ? "جاري التحديث..." : "تحديث 🔄"}
              </Button>

              <Link href="/add-task">
                <Button variant="primary" className="text-xs">
                  + إضافة مهمة
                </Button>
              </Link>
            </div>
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
                  ? "لم يتم العثور على أي مهام مسندة إليك أو لقسمك حالياً."
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
                            <span className="block text-[11px] text-molim-muted">الساعات المطلوبة:</span>
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
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </PageShell>
    </RoleGuard>
  );
}