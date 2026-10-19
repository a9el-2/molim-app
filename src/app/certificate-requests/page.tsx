"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import RoleGuard from "../components/RoleGuard";
import { useAuth } from "../lib/auth-context";
import {
  fetchCertificateRequests,
  updateCertificateRequest,
  CERTIFICATE_TYPE_TO_ARABIC,
  CERTIFICATE_STATUS_TO_ARABIC,
  CERTIFICATE_STATUS_FROM_ARABIC,
  type CertificateRequestDTO,
  type CertificateRequestStatus,
} from "../lib/supabase/dto";

type FilterType =
  | "الكل"
  | "شهادات"
  | "خطابات توصية"
  | "قيد المراجعة"
  | "بانتظار الاعتماد"
  | "صادرة"
  | "مرفوضة";

const FILTERS: FilterType[] = [
  "الكل",
  "شهادات",
  "خطابات توصية",
  "قيد المراجعة",
  "بانتظار الاعتماد",
  "صادرة",
  "مرفوضة",
];

export default function CertificateRequestsPage() {
  const { user, isReady } = useAuth();

  const [requests, setRequests] = useState<CertificateRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("الكل");
  const [search, setSearch] = useState("");

  const [selectedRequest, setSelectedRequest] =
    useState<CertificateRequestDTO | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await fetchCertificateRequests();
      if (res.ok && res.requests) {
        setRequests(res.requests);
      }
    } catch {
      // تجاهل الخطأ
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isReady) return;
    loadRequests();
  }, [isReady]);

  const pendingCount = requests.filter(
    (r) => r.status === "in_review" || r.status === ("قيد المراجعة" as CertificateRequestStatus)
  ).length;

  const approvedCount = requests.filter(
    (r) => r.status === "pending_approval" || r.status === ("بانتظار الاعتماد" as CertificateRequestStatus)
  ).length;

  const issuedCount = requests.filter(
    (r) => r.status === "issued" || r.status === ("صادرة" as CertificateRequestStatus)
  ).length;

  const rejectedCount = requests.filter(
    (r) => r.status === "rejected" || r.status === ("مرفوضة" as CertificateRequestStatus)
  ).length;

  const totalCount = requests.length;

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requests.filter((req) => {
      let matchesFilter = true;
      const typeArabic = CERTIFICATE_TYPE_TO_ARABIC[req.type] || req.type;
      const statusArabic = CERTIFICATE_STATUS_TO_ARABIC[req.status] || req.status;

      if (activeFilter === "شهادات") {
        matchesFilter = req.type !== "recommendation_letter";
      } else if (activeFilter === "خطابات توصية") {
        matchesFilter = req.type === "recommendation_letter";
      } else if (activeFilter !== "الكل") {
        const targetBackendStatus = CERTIFICATE_STATUS_FROM_ARABIC[activeFilter];
        matchesFilter = req.status === targetBackendStatus || statusArabic === activeFilter;
      }

      const volunteerName = req.user
        ? `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim()
        : "";
      const volunteerId = req.user?.id || req.user_id || "";
      const deptName = req.department?.name || "";

      const matchesSearch =
        !query ||
        volunteerName.toLowerCase().includes(query) ||
        volunteerId.toLowerCase().includes(query) ||
        typeArabic.toLowerCase().includes(query) ||
        deptName.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [requests, activeFilter, search]);

  function openRequest(req: CertificateRequestDTO) {
    setSelectedRequest(req);
    setReviewNotes(req.notes || "");
    setFeedback(null);
  }

  function closeRequest() {
    setSelectedRequest(null);
    setReviewNotes("");
    setFeedback(null);
  }

  async function handleUpdateStatus(
    newStatus: "pending_approval" | "issued" | "rejected"
  ) {
    if (!selectedRequest) return;

    setActionLoading(true);
    setFeedback(null);

    try {
      const res = await updateCertificateRequest(selectedRequest.id, {
        status: newStatus,
        notes: reviewNotes.trim(),
      });

      if (res.ok && res.request) {
        setRequests((prev) =>
          prev.map((r) => (r.id === selectedRequest.id ? res.request! : r))
        );
        setSelectedRequest(res.request);
        setFeedback({
          type: "success",
          text: `تم تحديث حالة الطلب إلى "${CERTIFICATE_STATUS_TO_ARABIC[newStatus]}" بنجاح.`,
        });
      } else {
        setFeedback({
          type: "error",
          text: res.error || "تعذر تحديث حالة الطلب.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "حدث خطأ غير متوقع أثناء تحديث الطلب.",
      });
    } finally {
      setActionLoading(false);
    }
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case "in_review":
      case "قيد المراجعة":
        return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900";
      case "pending_approval":
      case "بانتظار الاعتماد":
        return "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900";
      case "issued":
      case "صادرة":
        return "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900";
      case "rejected":
      case "مرفوضة":
        return "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900";
      default:
        return "border-molim bg-molim-soft text-molim-muted";
    }
  }

  return (
    <RoleGuard>
      <PageShell>
        <div dir="rtl" className="mx-auto max-w-5xl px-3 py-5 text-molim-foreground">
          {/* مسار التصفح */}
          <div className="mb-4 text-xs text-molim-muted flex items-center gap-2">
            <span>الرئيسية</span>
            <span>←</span>
            <span>الموارد البشرية والإدارة</span>
            <span>←</span>
            <span className="font-bold text-molim-foreground">
              طلبات الشهادات والتوصيات
            </span>
          </div>

          {/* العنوان */}
          <section className="mb-6">
            <h1 className="text-2xl font-black">
              طلبات الشهادات والتوصيات
            </h1>
            <p className="mt-1 text-xs leading-6 text-molim-muted">
              مراجعة واعتماد طلبات الشهادات وخطابات التوصية ومتابعة حالتها حتى الإصدار.
            </p>
          </section>

          {/* إحصائيات سريعة */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard title="قيد المراجعة" value={pendingCount} icon="⏳" />
            <StatCard title="بانتظار الاعتماد" value={approvedCount} icon="🕐" />
            <StatCard title="صادرة" value={issuedCount} icon="✅" />
            <StatCard title="مرفوضة" value={rejectedCount} icon="❌" />
            <StatCard title="إجمالي الطلبات" value={totalCount} icon="📄" />
          </section>

          {/* البحث والفلاتر */}
          <section className="mt-6 border border-molim bg-molim-surface p-4">
            <label className="mb-2 block text-xs font-bold">
              البحث عن طلب
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المتطوع، المعرف (MOL-ID) أو القسم..."
              className="h-11 w-full border border-molim bg-molim-soft px-3.5 text-xs outline-none transition focus:border-[#ed542f]"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`cursor-pointer border px-3.5 py-1.5 text-xs font-semibold transition ${
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

          {/* قائمة الطلبات */}
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">الطلبات الواردة</h2>
              <span className="text-xs text-molim-muted">
                {loading ? "جاري التحميل..." : `${filteredRequests.length} طلب`}
              </span>
            </div>

            {loading ? (
              <div className="border border-dashed border-molim bg-molim-surface p-12 text-center text-xs text-molim-muted">
                جاري تحميل الطلبات من قاعدة البيانات...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="border border-dashed border-molim bg-molim-surface p-10 text-center">
                <p className="font-bold text-sm">لا توجد طلبات</p>
                <p className="mt-1 text-xs text-molim-muted">
                  لا توجد طلبات تطابق معايير البحث أو الفلتر المحدد.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((req) => {
                  const volunteerName = req.user
                    ? `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim()
                    : req.user_id;

                  const typeArabic =
                    CERTIFICATE_TYPE_TO_ARABIC[req.type] || req.type;
                  const statusArabic =
                    CERTIFICATE_STATUS_TO_ARABIC[req.status] || req.status;

                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => openRequest(req)}
                      className="block w-full cursor-pointer border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f] hover:shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-sm">{volunteerName}</h3>

                            <span className="bg-molim-soft px-2 py-0.5 text-[11px] text-molim-muted">
                              {req.user?.id || req.user_id}
                            </span>

                            <span className="bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300">
                              {typeArabic}
                            </span>

                            <span
                              className={`border px-2 py-0.5 text-[11px] font-semibold ${getStatusStyle(
                                req.status
                              )}`}
                            >
                              {statusArabic}
                            </span>
                          </div>

                          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-molim-muted">
                            <span>القسم: {req.department?.name || "—"}</span>
                            <span>الساعات: {req.hours || 0}</span>
                            <span>مدة التطوع: {req.volunteer_period || "—"}</span>
                            <span>تاريخ الطلب: {req.request_date || "—"}</span>
                          </div>

                          {req.reviewer && (
                            <p className="mt-1.5 text-xs text-molim-muted">
                              راجعه: {req.reviewer.first_name} {req.reviewer.last_name || ""}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-xs font-bold text-[#ed542f]">
                          {req.status === "in_review"
                            ? "مراجعة واعتماد الطلب ←"
                            : "عرض التفاصيل ←"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* نافذة المراجعة والاعتماد (Modal) */}
          {selectedRequest && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeRequest();
              }}
            >
              <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-molim bg-molim-surface p-5 shadow-2xl">
                {/* رأس النافذة */}
                <div className="flex items-start justify-between gap-3 border-b border-molim pb-3">
                  <div>
                    <p className="text-xs text-molim-muted">تفاصيل وإجراءات الطلب</p>
                    <h2 className="mt-1 text-lg font-bold">
                      {CERTIFICATE_TYPE_TO_ARABIC[selectedRequest.type] ||
                        selectedRequest.type}
                    </h2>
                    <p className="mt-0.5 text-xs text-molim-muted">
                      {selectedRequest.user
                        ? `${selectedRequest.user.first_name} ${selectedRequest.user.last_name || ""}`
                        : selectedRequest.user_id}{" "}
                      — {selectedRequest.user?.id || selectedRequest.user_id}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeRequest}
                    className="cursor-pointer bg-molim-soft px-3 py-1 text-sm font-bold hover:bg-molim-soft"
                  >
                    ✕
                  </button>
                </div>

                {/* رسالة النتيجة */}
                {feedback && (
                  <div
                    className={`mt-4 border p-3 text-xs font-semibold ${
                      feedback.type === "success"
                        ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                        : "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                    }`}
                  >
                    {feedback.text}
                  </div>
                )}

                <div className="mt-4 space-y-3.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <InfoBox
                      title="المتطوع"
                      value={
                        selectedRequest.user
                          ? `${selectedRequest.user.first_name} ${selectedRequest.user.last_name || ""}`
                          : selectedRequest.user_id
                      }
                    />
                    <InfoBox
                      title="المعرف"
                      value={selectedRequest.user?.id || selectedRequest.user_id}
                    />
                    <InfoBox
                      title="القسم"
                      value={selectedRequest.department?.name || "—"}
                    />
                    <InfoBox
                      title="تاريخ الطلب"
                      value={selectedRequest.request_date || "—"}
                    />
                    <InfoBox
                      title="الساعات المعتمدة"
                      value={`${selectedRequest.hours || 0} ساعة`}
                    />
                    <InfoBox
                      title="مدة التطوع"
                      value={selectedRequest.volunteer_period || "—"}
                    />
                  </div>

                  <div className="border border-molim bg-molim-soft p-3">
                    <p className="text-[11px] text-molim-muted">حالة الطلب الحالية</p>
                    <p className="mt-1 font-bold text-sm">
                      {CERTIFICATE_STATUS_TO_ARABIC[selectedRequest.status] ||
                        selectedRequest.status}
                    </p>
                  </div>

                  {selectedRequest.notes && (
                    <div className="border border-molim bg-molim-soft p-3">
                      <p className="text-[11px] text-molim-muted">ملاحظات سابقة</p>
                      <p className="mt-1 text-xs leading-5">
                        {selectedRequest.notes}
                      </p>
                    </div>
                  )}

                  {/* حقل الملاحظات للإدارة */}
                  <div>
                    <label
                      htmlFor="reviewNotesField"
                      className="mb-1.5 block text-xs font-bold"
                    >
                      ملاحظات وتوجيهات المراجعة
                    </label>
                    <textarea
                      id="reviewNotesField"
                      rows={3}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="اكتب ملاحظات الاعتماد أو أسباب الرفض إن وجدت..."
                      className="w-full resize-none border border-molim bg-molim-soft p-3 text-xs outline-none transition focus:border-[#ed542f]"
                    />
                  </div>

                  {/* أزرار الإجراءات حسب حالة الطلب */}
                  {selectedRequest.status === "in_review" && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus("pending_approval")}
                        className="h-11 cursor-pointer bg-green-600 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        {actionLoading ? "جاري الحفظ..." : "✅ قبول الطلب (بانتظار الاعتماد)"}
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus("rejected")}
                        className="h-11 cursor-pointer bg-red-600 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {actionLoading ? "جاري الحفظ..." : "❌ رفض الطلب"}
                      </button>
                    </div>
                  )}

                  {selectedRequest.status === "pending_approval" && (
                    <div className="space-y-2 pt-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus("issued")}
                        className="h-11 w-full cursor-pointer bg-[#ed542f] text-xs font-bold text-white transition hover:bg-[#d94725] disabled:opacity-50"
                      >
                        {actionLoading
                          ? "جاري الإصدار..."
                          : "🎓 اعتماد وإصدار الشهادة / الخطاب رسمياً"}
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus("rejected")}
                        className="h-10 w-full cursor-pointer border border-red-300 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        إلغاء ورفض الطلب
                      </button>
                    </div>
                  )}

                  {selectedRequest.status === "issued" && (
                    <div className="border border-green-200 bg-green-50 p-3 text-center text-xs font-bold text-green-700 dark:bg-green-950/40 dark:text-green-300">
                      ✓ تم إصدار هذه الشهادة / الخطاب بنجاح في تاريخ {selectedRequest.issued_at || "—"}.
                    </div>
                  )}

                  {selectedRequest.status === "rejected" && (
                    <div className="border border-red-200 bg-red-50 p-3 text-center text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      تم رفض هذا الطلب.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={closeRequest}
                    className="h-10 w-full cursor-pointer border border-molim bg-molim-surface text-xs font-bold text-molim-foreground hover:bg-molim-soft"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageShell>
    </RoleGuard>
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
    <div className="border border-molim bg-molim-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] leading-4 text-molim-muted">{title}</p>
          <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
        <div className="bg-molim-soft px-2 py-1.5 text-base">{icon}</div>
      </div>
    </div>
  );
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="border border-molim bg-molim-soft/50 p-2.5">
      <p className="text-[10px] text-molim-muted">{title}</p>
      <p className="mt-0.5 text-xs font-bold text-molim-foreground truncate">
        {value}
      </p>
    </div>
  );
}