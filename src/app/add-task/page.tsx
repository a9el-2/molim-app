"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageShell from "../components/PageShell";
import RoleGuard from "../components/RoleGuard";
import Card from "../components/Card";
import Button from "../components/Button";
import { useAuth } from "../lib/auth-context";

export type DepartmentItem = {
  id: string;
  name: string;
};

type TaskScopeOption = "self" | "own_department" | "departments" | "all";

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

export default function AddTaskPage() {
  const router = useRouter();
  const { user: currentUser, isReady } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TaskScopeOption>("self");
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [requestedHours, setRequestedHours] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // الخيارات المتاحة للنطاق بحسب رتبة المستخدم الحالية
  const availableScopeOptions = useMemo<{ value: TaskScopeOption; label: string }[]>(() => {
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

  // جلب الأقسام عندما يحتاج المستخدم نطاق departments
  const loadDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    const response = await fetch("/api/departments", {
      headers: authHeaders(),
    }).catch(() => null);

    if (response && response.ok) {
      const data = await parseJson<{ departments?: DepartmentItem[] }>(response);
      setDepartments(data?.departments ?? []);
    }
    setLoadingDepartments(false);
  }, []);

  useEffect(() => {
    if (isReady && (scope === "departments" || currentUser?.role === "HR" || currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN")) {
      loadDepartments();
    }
  }, [isReady, scope, currentUser?.role, loadDepartments]);

  function toggleDepartment(deptId: string) {
    setSelectedDepartmentIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
    setErrorMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("عنوان المهمة مطلوب ولا يمكن أن يكون فارغاً.");
      return;
    }

    if (trimmedTitle.length > 150) {
      setErrorMessage("عنوان المهمة طويل جداً (الحد الأقصى 150 حرفاً).");
      return;
    }

    if (scope === "departments" && selectedDepartmentIds.length === 0) {
      setErrorMessage("يرجى اختيار قسم واحد على الأقل للمهمة.");
      return;
    }

    let parsedHours: number | undefined = undefined;
    if (requestedHours.trim()) {
      const num = Number(requestedHours);
      if (Number.isNaN(num) || num <= 0 || num > 1000 || Math.abs(num * 4 - Math.round(num * 4)) > 1e-6) {
        setErrorMessage("الساعات المطلوبة يجب أن تكون رقماً موجباً من مضاعفات 0.25 وحتى 1000 ساعة.");
        return;
      }
      parsedHours = num;
    }

    setSubmitting(true);

    const payload = {
      title: trimmedTitle,
      description: description.trim() || undefined,
      scope,
      departmentIds: scope === "departments" ? selectedDepartmentIds : undefined,
      requestedHours: parsedHours,
      dueDate: dueDate.trim() || undefined,
    };

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!response) {
      setErrorMessage("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
      setSubmitting(false);
      return;
    }

    const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(response);

    if (response.status === 201 || (response.ok && data?.ok)) {
      setSuccessMessage("تم إنشاء المهمة بنجاح! جاري الانتقال لقائمة المهام...");
      setTimeout(() => {
        router.push("/tasks");
      }, 1200);
      return;
    }

    // إظهار رسالة الخادم عند الأخطاء 400 و 403 وغيرها
    setErrorMessage(data?.error ?? data?.message ?? "تعذر إنشاء المهمة.");
    setSubmitting(false);
  }

  return (
    <RoleGuard allowedRoles={["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"]}>
      <PageShell narrow>
        <div className="space-y-6">
          {/* ترويسة الصفحة */}
          <div>
            <Link
              href="/tasks"
              className="text-xs font-bold text-molim-orange hover:underline inline-flex items-center gap-1 mb-2"
            >
              <span>→</span>
              <span>العودة للمهام</span>
            </Link>
            <h1 className="text-2xl font-black text-molim-foreground">
              إضافة مهمة جديدة
            </h1>
            <p className="mt-1 text-sm text-molim-muted">
              أنشئ مهمة جديدة لنفسك أو لأعضاء قسمك أو للأقسام المستهدفة.
            </p>
          </div>

          {/* تنبيهات النجاح والخطأ */}
          {successMessage && (
            <div className="rounded border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-300">
              ✓ {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* نموذج الإنشاء */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Card className="p-5 space-y-4">
              {/* العنوان */}
              <div>
                <label className="block text-xs font-bold text-molim-foreground mb-1">
                  عنوان المهمة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  disabled={submitting}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="مثال: تصميم إعلان المنح الدراسية..."
                  className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange disabled:opacity-50"
                />
              </div>

              {/* الوصف */}
              <div>
                <label className="block text-xs font-bold text-molim-foreground mb-1">
                  الوصف والتفاصيل (اختياري)
                </label>
                <textarea
                  rows={4}
                  maxLength={2000}
                  disabled={submitting}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="اكتب تفاصيل ومخرجات المهمة المتوقعة..."
                  className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange disabled:opacity-50"
                />
              </div>

              {/* النطاق */}
              <div>
                <label className="block text-xs font-bold text-molim-foreground mb-1">
                  نطاق المهمة <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                  {availableScopeOptions.map((opt) => {
                    const isSelected = scope === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setScope(opt.value);
                          setErrorMessage(null);
                        }}
                        className={`rounded border p-2.5 text-xs font-bold text-center transition ${
                          isSelected
                            ? "border-molim-orange bg-molim-orange text-white"
                            : "border-molim bg-molim-surface text-molim-foreground hover:border-molim-orange"
                        } disabled:opacity-50`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* اختيار الأقسام في حال كان النطاق departments */}
              {scope === "departments" && (
                <div className="rounded border border-molim bg-molim-soft p-4 space-y-2">
                  <label className="block text-xs font-bold text-molim-foreground">
                    الأقسام المستهدفة <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[11px] text-molim-muted">
                    اختر الأقسام التي تتبع لها هذه المهمة:
                  </p>

                  {loadingDepartments && (
                    <p className="text-xs text-molim-muted">جاري تحميل قائمة الأقسام...</p>
                  )}

                  {!loadingDepartments && departments.length === 0 && (
                    <p className="text-xs text-red-600">تعذر تحميل الأقسام أو لا توجد أقسام متاحة.</p>
                  )}

                  {!loadingDepartments && departments.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {departments.map((dept) => {
                        const isChecked = selectedDepartmentIds.includes(dept.id);
                        return (
                          <button
                            key={dept.id}
                            type="button"
                            disabled={submitting}
                            onClick={() => toggleDepartment(dept.id)}
                            className={`rounded border px-3 py-2 text-xs font-bold text-right transition ${
                              isChecked
                                ? "border-molim-orange bg-molim-orange/15 text-molim-orange"
                                : "border-molim bg-molim-surface text-molim-foreground hover:border-molim"
                            } disabled:opacity-50`}
                          >
                            <span>{isChecked ? "☑ " : "☐ "}</span>
                            <span>{dept.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* الساعات المطلوبة وتاريخ الاستحقاق */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-molim-foreground mb-1">
                    الساعات التقديرية (اختياري)
                  </label>
                  <input
                    type="number"
                    min="0.25"
                    max="1000"
                    step="0.25"
                    disabled={submitting}
                    value={requestedHours}
                    onChange={(e) => {
                      setRequestedHours(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="مثال: 3.5"
                    className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange disabled:opacity-50"
                  />
                  <p className="mt-1 text-[10px] text-molim-muted">
                    بخطوات ربع ساعة (0.25، 0.5، 0.75...)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-molim-foreground mb-1">
                    تاريخ الاستحقاق (اختياري)
                  </label>
                  <input
                    type="date"
                    disabled={submitting}
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="w-full rounded border border-molim bg-molim-surface px-3 py-2 text-sm text-molim-foreground focus:outline-none focus:border-molim-orange disabled:opacity-50"
                  />
                </div>
              </div>
            </Card>

            {/* أزرار الإجراء */}
            <div className="flex items-center justify-end gap-3">
              <Link href="/tasks">
                <Button variant="outline" type="button" disabled={submitting} className="text-xs">
                  إلغاء
                </Button>
              </Link>

              <Button
                variant="primary"
                type="submit"
                disabled={submitting}
                className="text-xs"
              >
                {submitting ? "جاري إنشاء المهمة..." : "حفظ المهمة"}
              </Button>
            </div>
          </form>
        </div>
      </PageShell>
    </RoleGuard>
  );
}