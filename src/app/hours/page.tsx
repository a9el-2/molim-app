"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../lib/auth-context";
import {
  fetchMyHours,
  submitHours,
  updateHours,
  type HoursLogDTO,
} from "../lib/supabase/dto";
import { canEditOwnEntry, validateHoursSubmission } from "../lib/hours-policy";

type FilterType = "الكل" | "قيد المراجعة" | "معتمدة" | "مرفوضة";

const filters: FilterType[] = [
  "الكل",
  "قيد المراجعة",
  "معتمدة",
  "مرفوضة",
];

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStatusLabel(status: string): "قيد المراجعة" | "معتمدة" | "مرفوضة" {
  if (status === "in_review" || status === "pending" || status === "قيد المراجعة") {
    return "قيد المراجعة";
  }
  if (status === "approved" || status === "معتمدة") {
    return "معتمدة";
  }
  return "مرفوضة";
}

function getStatusStyle(status: string) {
  const label = getStatusLabel(status);
  if (label === "قيد المراجعة") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }
  if (label === "معتمدة") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

export default function HoursPage() {
  const { user, isReady } = useAuth();

  const [records, setRecords] = useState<HoursLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<FilterType>("الكل");
  const [search, setSearch] = useState("");

  // عرض التفاصيل
  const [selectedRecord, setSelectedRecord] = useState<HoursLogDTO | null>(null);

  // وضع التعديل في النافذة
  const [isEditing, setIsEditing] = useState(false);
  const [editHours, setEditHours] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // نافذة تقديم ساعات جديدة
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [newHours, setNewHours] = useState("");
  const [newDate, setNewDate] = useState(getTodayString());
  const [newDescription, setNewDescription] = useState("");
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newSubmitError, setNewSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadHours = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const result = await fetchMyHours();
    if (result.ok) {
      setRecords(result.hours);
    } else {
      setFetchError(result.error ?? "تعذر تحميل سجل الساعات.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isReady) {
      loadHours();
    }
  }, [isReady, loadHours]);

  // إحصائيات السجلات
  const pendingCount = useMemo(
    () =>
      records.filter(
        (r) => getStatusLabel(r.status) === "قيد المراجعة"
      ).length,
    [records]
  );

  const approvedCount = useMemo(
    () =>
      records.filter(
        (r) => getStatusLabel(r.status) === "معتمدة"
      ).length,
    [records]
  );

  const rejectedCount = useMemo(
    () =>
      records.filter(
        (r) => getStatusLabel(r.status) === "مرفوضة"
      ).length,
    [records]
  );

  const submittedHoursTotal = useMemo(
    () =>
      records.reduce(
        (sum, r) => sum + Number(r.submitted_hours || 0),
        0
      ),
    [records]
  );

  const approvedHoursTotal = useMemo(
    () =>
      records.reduce(
        (sum, r) =>
          sum +
          (getStatusLabel(r.status) === "معتمدة"
            ? Number(r.approved_hours ?? r.submitted_hours ?? 0)
            : 0),
        0
      ),
    [records]
  );

  const unapprovedRecords = useMemo(
    () =>
      records.filter(
        (r) => getStatusLabel(r.status) !== "معتمدة"
      ),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const statusLabel = getStatusLabel(record.status);
      const matchesFilter =
        activeFilter === "الكل" || statusLabel === activeFilter;

      const desc = (record.description || "").toLowerCase();
      const date = (record.date || "").toLowerCase();
      const matchesSearch =
        !query || desc.includes(query) || date.includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [records, activeFilter, search]);

  // فتح سجل
  function openRecord(record: HoursLogDTO) {
    setSelectedRecord(record);
    setIsEditing(false);
    setEditError(null);
    setEditHours(String(record.submitted_hours));
    setEditDate(record.date);
    setEditDescription(record.description || "");
  }

  function closeRecord() {
    setSelectedRecord(null);
    setIsEditing(false);
    setEditError(null);
  }

  // إرسال ساعات جديدة
  async function handleCreateHours(e: React.FormEvent) {
    e.preventDefault();
    setNewSubmitError(null);

    const hoursNum = parseFloat(newHours);
    if (Number.isNaN(hoursNum)) {
      setNewSubmitError("يرجى إدخال عدد ساعات صحيح.");
      return;
    }

    // التحقق المبدئي بالسياسة
    const localValidation = validateHoursSubmission({
      hours: hoursNum,
      workDate: newDate,
      note: newDescription,
    });

    if (!localValidation.valid) {
      setNewSubmitError(localValidation.message ?? "بيانات الساعات غير صحيحة.");
      return;
    }

    setNewSubmitting(true);
    const result = await submitHours({
      hours: hoursNum,
      date: newDate,
      description: newDescription.trim(),
    });

    setNewSubmitting(false);

    if (!result.ok) {
      setNewSubmitError(result.error ?? "تعذر تقديم الساعات.");
      return;
    }

    setIsSubmitModalOpen(false);
    setNewHours("");
    setNewDate(getTodayString());
    setNewDescription("");
    setSuccessMessage("تم تقديم الساعات بنجاح.");
    setTimeout(() => setSuccessMessage(null), 4000);
    await loadHours();
  }

  // تعديل السجل القائم
  async function handleUpdateHours(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRecord) return;
    setEditError(null);

    const hoursNum = parseFloat(editHours);
    if (Number.isNaN(hoursNum)) {
      setEditError("يرجى إدخال عدد ساعات صحيح.");
      return;
    }

    const localValidation = validateHoursSubmission({
      hours: hoursNum,
      workDate: editDate,
      note: editDescription,
    });

    if (!localValidation.valid) {
      setEditError(localValidation.message ?? "بيانات الساعات غير صحيحة.");
      return;
    }

    setEditSubmitting(true);
    const result = await updateHours(selectedRecord.id, {
      hours: hoursNum,
      date: editDate,
      description: editDescription.trim(),
    });
    setEditSubmitting(false);

    if (!result.ok) {
      setEditError(result.error ?? "تعذر تعديل السجل.");
      return;
    }

    closeRecord();
    setSuccessMessage("تم تعديل السجل وإعادته للمراجعة بنجاح.");
    setTimeout(() => setSuccessMessage(null), 4000);
    await loadHours();
  }

  // هل السجل الحالي قابل للتعديل؟
  const isSelectedRecordEditable = useMemo(() => {
    if (!selectedRecord) return false;
    const policyStatus =
      selectedRecord.status === "in_review"
        ? "pending"
        : selectedRecord.status;
    return canEditOwnEntry({
      status: policyStatus,
      isOwner: true,
    });
  }, [selectedRecord]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-molim px-4 py-5 text-molim-foreground"
    >
      <div className="mx-auto max-w-5xl">

        {/* Breadcrumb */}
        <div className="mb-5 text-sm text-molim-muted">
          <span>الرئيسية</span>
          <span className="mx-2">←</span>
          <span>سجل متابعة العمل التطوعي</span>
          <span className="mx-2">←</span>
          <span className="font-semibold text-molim-foreground">
            سجل الساعات التطوعية
          </span>
        </div>

        {/* Header & Submit Button */}
        <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              سجل الساعات التطوعية
            </h1>
            <p className="mt-1 text-sm text-molim-muted">
              متابعة ساعاتك التطوعية المسجلة وتحديثها.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewSubmitError(null);
              setIsSubmitModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#ed542f] px-5 py-3 font-semibold text-white shadow transition hover:bg-[#d94420] active:scale-95"
          >
            <span>➕</span>
            <span>تسجيل ساعات جديدة</span>
          </button>
        </section>

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
            ✅ {successMessage}
          </div>
        )}

        {/* Error Alert */}
        {fetchError && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            ⚠️ {fetchError}
            <button
              type="button"
              onClick={loadHours}
              className="mr-3 underline hover:no-underline"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* إجمالي الساعات المعتمدة — بارز أعلى الصفحة */}
        <section className="overflow-hidden rounded-2xl border border-molim bg-molim-surface">
          <div className="border-b-4 border-[#ed542f]">
            <div className="flex items-center justify-between gap-4 p-6">
              <div>
                <p className="text-sm text-molim-muted">
                  إجمالي الساعات المعتمدة
                </p>

                <p className="mt-2 text-5xl font-black text-[#ed542f]">
                  {approvedHoursTotal}
                </p>

                <p className="mt-3 text-xs leading-5 text-molim-muted">
                  الساعات المعتمدة في سجلّك التطوعي حتى الآن.
                </p>
              </div>

              <div className="rounded-2xl bg-[#ed542f]/10 px-5 py-4 text-3xl">
                📊
              </div>
            </div>
          </div>
        </section>

        {/* عدادات الحالة */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            title="قيد المراجعة"
            value={pendingCount}
            icon="⏳"
          />
          <StatCard
            title="معتمدة"
            value={approvedCount}
            icon="✅"
          />
          <StatCard
            title="مرفوضة"
            value={rejectedCount}
            icon="❌"
          />
          <StatCard
            title="إجمالي الساعات المسجلة"
            value={submittedHoursTotal}
            icon="🕒"
          />
        </section>

        {/* الساعات غير المعتمدة (قيد المراجعة أو مرفوضة) */}
        {!loading && unapprovedRecords.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-bold">
              الساعات غير المعتمدة
            </h2>

            <div className="mt-3 space-y-2">
              {unapprovedRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => openRecord(record)}
                  className="block w-full cursor-pointer rounded-2xl border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {record.description || "ساعات تطوعية"}
                      </p>

                      <p className="mt-1 text-xs text-molim-muted">
                        {record.submitted_hours} ساعة — {record.date}
                      </p>
                    </div>

                    <span
                      className={`rounded-lg border px-2 py-1 text-xs font-medium ${getStatusStyle(
                        record.status
                      )}`}
                    >
                      {getStatusLabel(record.status)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Search & Filters */}
        <section className="mt-6 rounded-2xl border border-molim bg-molim-surface p-4">
          <label className="mb-2 block text-sm font-semibold">
            البحث
          </label>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بوصف المهمة أو التاريخ..."
            className="h-12 w-full rounded-xl border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f] focus:ring-2 focus:ring-[#ed542f]/10"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  activeFilter === filter
                    ? "border-[#ed542f] bg-[#ed542f] text-white"
                    : "border-molim bg-molim-surface text-molim-foreground hover:bg-molim-soft"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </section>

        {/* Records List / Loading / Empty */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              جميع السجلات
            </h2>

            <span className="text-sm text-molim-muted">
              {filteredRecords.length} سجل
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-molim bg-molim-surface p-12 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-molim border-t-[#ed542f]" />
              <p className="font-semibold text-molim-muted">
                جاري تحميل سجل الساعات...
              </p>
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-molim bg-molim-surface p-12 text-center">
              <span className="text-4xl">🕒</span>
              <p className="mt-3 text-lg font-bold">
                لا توجد ساعات مسجلة حتى الآن
              </p>
              <p className="mt-1 text-sm text-molim-muted">
                ابدأ بتسجيل ساعاتك التطوعية ليتم مراجعتها واعتمادها.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewSubmitError(null);
                  setIsSubmitModalOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ed542f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d94420]"
              >
                ➕ تسجيل أول نشاط تطوعي
              </button>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-molim bg-molim-surface p-10 text-center">
              <p className="font-semibold">
                لا توجد سجلات مطابقة
              </p>
              <p className="mt-2 text-sm text-molim-muted">
                لا توجد سجلات مطابقة للبحث أو الحالة المحددة.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => openRecord(record)}
                  className="block w-full cursor-pointer rounded-2xl border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f] hover:shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">
                          {record.description || "ساعات تطوعية"}
                        </h3>

                        <span
                          className={`rounded-lg border px-2 py-1 text-xs font-medium ${getStatusStyle(
                            record.status
                          )}`}
                        >
                          {getStatusLabel(record.status)}
                        </span>

                        {record.is_self_approved && (
                          <span className="rounded-lg bg-purple-50 border border-purple-200 px-2 py-1 text-xs font-medium text-purple-700">
                            اعتماد ذاتي
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-molim-muted">
                        <span>تاريخ العمل: {record.date}</span>
                        <span>الساعات المسجلة: {record.submitted_hours} ساعة</span>
                        {getStatusLabel(record.status) === "معتمدة" && (
                          <span>
                            الساعات المعتمدة:{" "}
                            {record.approved_hours ?? record.submitted_hours} ساعة
                          </span>
                        )}
                        {record.reviewed_at && (
                          <span>
                            {getStatusLabel(record.status) === "معتمدة"
                              ? "تاريخ الاعتماد: "
                              : "تاريخ الرفض: "}
                            {record.reviewed_at}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-semibold text-[#ed542f]">
                      عرض التفاصيل ←
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* نافذة تسجيل ساعات جديدة */}
      {isSubmitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !newSubmitting) {
              setIsSubmitModalOpen(false);
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-molim-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-molim pb-4">
              <h2 className="text-xl font-bold">تسجيل ساعات جديدة</h2>
              <button
                type="button"
                disabled={newSubmitting}
                onClick={() => setIsSubmitModalOpen(false)}
                className="cursor-pointer rounded-xl bg-molim-soft px-3 py-2 text-molim-muted hover:text-molim-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateHours} className="mt-5 space-y-4">
              {newSubmitError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  ⚠️ {newSubmitError}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  عدد الساعات (من 0.25 إلى 24 بخطوات 0.25)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  required
                  value={newHours}
                  onChange={(e) => setNewHours(e.target.value)}
                  placeholder="مثال: 3.5"
                  className="h-12 w-full rounded-xl border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  تاريخ العمل التطوعي
                </label>
                <input
                  type="date"
                  required
                  max={getTodayString()}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-12 w-full rounded-xl border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  وصف العمل التطوعي / الملاحظات
                </label>
                <textarea
                  rows={4}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="اكتب وصفاً مختصراً لما قمت به (إجباري عند تجاوز 12 ساعة في اليوم الواحد)..."
                  className="w-full resize-none rounded-xl border border-molim bg-molim-soft p-4 text-sm outline-none transition focus:border-[#ed542f]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={newSubmitting}
                  className="h-12 flex-1 cursor-pointer rounded-xl bg-[#ed542f] font-semibold text-white transition hover:bg-[#d94420] disabled:opacity-50"
                >
                  {newSubmitting ? "جاري الإرسال..." : "إرسال الساعات للمراجعة"}
                </button>
                <button
                  type="button"
                  disabled={newSubmitting}
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="h-12 rounded-xl border border-molim px-5 font-semibold text-molim-muted hover:bg-molim-soft"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل وتعديل السجل */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editSubmitting) {
              closeRecord();
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-molim-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-molim pb-4">
              <div>
                <p className="text-xs text-molim-muted">
                  تفاصيل سجل الساعات
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {selectedRecord.description || "ساعات تطوعية"}
                </h2>
              </div>

              <button
                type="button"
                disabled={editSubmitting}
                onClick={closeRecord}
                className="cursor-pointer rounded-xl bg-molim-soft px-3 py-2 text-molim-muted hover:text-molim-foreground"
              >
                ✕
              </button>
            </div>

            {isEditing ? (
              /* نموذج التعديل */
              <form onSubmit={handleUpdateHours} className="mt-5 space-y-4">
                {editError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    ⚠️ {editError}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    عدد الساعات
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    required
                    value={editHours}
                    onChange={(e) => setEditHours(e.target.value)}
                    className="h-12 w-full rounded-xl border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    تاريخ العمل
                  </label>
                  <input
                    type="date"
                    required
                    max={getTodayString()}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-12 w-full rounded-xl border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    الوصف / الملاحظة
                  </label>
                  <textarea
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full resize-none rounded-xl border border-molim bg-molim-soft p-4 text-sm outline-none transition focus:border-[#ed542f]"
                  />
                </div>

                <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
                  ℹ️ عند حفظ التعديلات ستعود حالة السجل تلقائياً إلى «قيد المراجعة».
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={editSubmitting}
                    className="h-12 flex-1 cursor-pointer rounded-xl bg-[#ed542f] font-semibold text-white transition hover:bg-[#d94420] disabled:opacity-50"
                  >
                    {editSubmitting ? "جاري الحفظ..." : "حفظ التعديلات وإعادة الإرسال"}
                  </button>
                  <button
                    type="button"
                    disabled={editSubmitting}
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    className="h-12 rounded-xl border border-molim px-5 font-semibold text-molim-muted hover:bg-molim-soft"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            ) : (
              /* عرض التفاصيل */
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <InfoBox
                    title="تاريخ العمل"
                    value={selectedRecord.date}
                  />

                  <InfoBox
                    title="الحالة"
                    value={getStatusLabel(selectedRecord.status)}
                  />

                  <InfoBox
                    title="الساعات المسجلة"
                    value={`${selectedRecord.submitted_hours} ساعة`}
                  />

                  <InfoBox
                    title="الساعات المعتمدة"
                    value={
                      getStatusLabel(selectedRecord.status) === "معتمدة"
                        ? `${selectedRecord.approved_hours ?? selectedRecord.submitted_hours} ساعة`
                        : "—"
                    }
                  />
                </div>

                {selectedRecord.description && (
                  <div className="rounded-2xl bg-molim-soft p-4">
                    <p className="text-xs text-molim-muted">الوصف / ملاحظة المتطوع</p>
                    <p className="mt-1 text-sm leading-6">
                      {selectedRecord.description}
                    </p>
                  </div>
                )}

                {/* ملاحظات المراجع إن وُجدت */}
                {selectedRecord.review_notes && (
                  <div className="rounded-2xl border border-molim bg-molim-soft p-4">
                    <p className="text-xs text-molim-muted">
                      {getStatusLabel(selectedRecord.status) === "معتمدة"
                        ? "ملاحظات الاعتماد"
                        : "سبب الرفض"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-molim-foreground">
                      {selectedRecord.review_notes}
                    </p>
                    {selectedRecord.reviewed_at && (
                      <p className="mt-1 text-xs text-molim-muted">
                        بتاريخ {selectedRecord.reviewed_at}
                      </p>
                    )}
                  </div>
                )}

                {/* حالة الانتظار */}
                {getStatusLabel(selectedRecord.status) === "قيد المراجعة" && (
                  <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-sm font-semibold text-yellow-800">
                      بانتظار المراجعة
                    </p>
                    <p className="mt-1 text-xs leading-5 text-yellow-700">
                      سجلّك هذا بانتظار مراجعة المسؤول واعتماد الساعات.
                    </p>
                  </div>
                )}

                {/* زر التعديل إذا كان مسموحاً */}
                {isSelectedRecordEditable && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="h-12 w-full cursor-pointer rounded-xl bg-molim-soft border border-molim font-semibold text-[#ed542f] transition hover:bg-[#ed542f]/10"
                  >
                    ✏️ تعديل هذا السجل وإعادة إرساله
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeRecord}
                  className="h-12 w-full cursor-pointer rounded-xl border border-molim bg-molim-surface font-semibold text-molim-foreground hover:bg-molim-soft"
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-molim bg-molim-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs leading-5 text-molim-muted">{title}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-xl bg-molim-soft px-2.5 py-2">{icon}</div>
      </div>
    </div>
  );
}

function InfoBox({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-molim p-4">
      <p className="text-xs text-molim-muted">{title}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}