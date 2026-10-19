"use client";

import { useEffect, useState, useMemo } from "react";
import PageShell from "../components/PageShell";
import RoleGuard from "../components/RoleGuard";
import { useAuth } from "../lib/auth-context";
import {
  fetchMyHours,
  fetchCertificateRequests,
  submitCertificateRequest,
  CERTIFICATE_TYPE_TO_ARABIC,
  CERTIFICATE_STATUS_TO_ARABIC,
  type CertificateRequestDTO,
  type CertificateRequestType,
} from "../lib/supabase/dto";

type CertificateDef = {
  id: CertificateRequestType;
  title: string;
  description: string;
  requirement: string;
  targetHours?: number;
  icon: string;
};

const CERTIFICATE_DEFINITIONS: CertificateDef[] = [
  {
    id: "volunteer",
    title: "شهادة التطوع",
    description: "شهادة تقديرية توثق مشاركتك في العمل التطوعي مع فريق مُلم.",
    requirement: "إكمال 40 ساعة تطوعية معتمدة",
    targetHours: 40,
    icon: "🏅",
  },
  {
    id: "participation",
    title: "شهادة المشاركة",
    description: "شهادة توثق مشاركتك الفعلية في أعمال وأنشطة فريق مُلم.",
    requirement: "المشاركة الفعلية في أعمال الفريق",
    icon: "🎖️",
  },
  {
    id: "expertise",
    title: "شهادة الخبرة",
    description: "شهادة توثق الخبرة التي اكتسبتها من خلال العمل والمشاركة المستمرة.",
    requirement: "إكمال 300 ساعة تطوعية معتمدة",
    targetHours: 300,
    icon: "🏆",
  },
];

export default function CertificatesPage() {
  const { user, isReady } = useAuth();

  const [approvedHours, setApprovedHours] = useState<number>(0);
  const [requests, setRequests] = useState<CertificateRequestDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submittingType, setSubmittingType] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!isReady) return;

    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const [hoursRes, certRes] = await Promise.all([
          fetchMyHours(),
          fetchCertificateRequests({ mine: true }),
        ]);

        if (!isMounted) return;

        if (hoursRes?.hours) {
          const total = hoursRes.hours
            .filter((h) => h.status === "approved")
            .reduce(
              (sum, h) =>
                sum + (Number(h.approved_hours ?? h.submitted_hours) || 0),
              0
            );
          setApprovedHours(total);
        }

        if (certRes?.ok && certRes.requests) {
          setRequests(certRes.requests);
        }
      } catch {
        // تجاهل الخطأ المؤقت
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isReady]);

  // الطلبات المعلقة أو الصادرة المصنفة حسب النوع
  const existingRequestsByType = useMemo(() => {
    const map = new Map<string, CertificateRequestDTO>();
    for (const req of requests) {
      if (!map.has(req.type)) {
        map.set(req.type, req);
      }
    }
    return map;
  }, [requests]);

  const handleRequest = async (type: CertificateRequestType) => {
    setActionMessage(null);
    setSubmittingType(type);

    try {
      const res = await submitCertificateRequest({ type });
      if (res.ok && res.request) {
        setRequests((prev) => [res.request!, ...prev]);
        setActionMessage({
          type: "success",
          text: `تم تقديم طلب ${CERTIFICATE_TYPE_TO_ARABIC[type] || type} بنجاح، وهو قيد المراجعة.`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "تعذر تقديم الطلب. حاول مرة أخرى.",
        });
      }
    } catch {
      setActionMessage({
        type: "error",
        text: "حدث خطأ غير متوقع أثناء إرسال الطلب.",
      });
    } finally {
      setSubmittingType(null);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
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
  };

  const recommendationRequest = existingRequestsByType.get("recommendation_letter");

  return (
    <RoleGuard>
      <PageShell>
        <div dir="rtl" className="mx-auto max-w-2xl px-2 py-4">
          {/* عنوان الصفحة */}
          <section className="mb-6">
            <p className="text-xs font-bold text-[#ed542f]">الإنجازات والاعتمادات</p>
            <h1 className="mt-1 text-2xl font-black text-molim-foreground">
              الشهادات وخطابات التوصية
            </h1>
            <p className="mt-2 text-sm leading-6 text-molim-muted">
              استعرض الشهادات المستحقة وخطاب التوصية، وقدّم طلبك ليتم مراجعته واعتماده من الجهة المختصة.
            </p>
          </section>

          {/* تنبيه الحالة */}
          {actionMessage && (
            <div
              className={`mb-6 border p-4 text-sm font-medium ${
                actionMessage.type === "success"
                  ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800"
                  : "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800"
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {/* ملخص الساعات المعتمدة */}
          <section className="mb-8 border border-molim bg-molim-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-molim-muted">ساعاتك المعتمدة</p>
                <p className="mt-1 text-3xl font-black text-molim-foreground">
                  {loading ? "..." : approvedHours}
                </p>
                <p className="mt-1 text-xs text-molim-muted">ساعة تطوعية معتمدة</p>
              </div>

              <div className="flex h-14 w-14 items-center justify-center bg-[#ed542f]/10 text-2xl">
                ⏱
              </div>
            </div>

            <div className="mt-4 h-2 w-full bg-molim-soft">
              <div
                className="h-2 bg-[#ed542f] transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((approvedHours / 40) * 100))}%`,
                }}
              />
            </div>

            <div className="mt-2 flex justify-between text-[11px] text-molim-muted">
              <span>0 ساعة</span>
              <span>40 ساعة — شهادة التطوع</span>
            </div>
          </section>

          {/* قائمة الشهادات */}
          <section className="mb-8 space-y-4">
            <div className="mb-3">
              <h2 className="text-lg font-black text-molim-foreground">الشهادات</h2>
              <p className="mt-1 text-xs text-molim-muted">
                يظهر لكل شهادة وضع الاستحقاق وإمكانية التقديم.
              </p>
            </div>

            {CERTIFICATE_DEFINITIONS.map((cert) => {
              const existing = existingRequestsByType.get(cert.id);
              const isEligible =
                cert.targetHours !== undefined
                  ? approvedHours >= cert.targetHours
                  : user?.status === "active";

              const isSubmitting = submittingType === cert.id;

              const progressText =
                cert.targetHours !== undefined
                  ? `${approvedHours} / ${cert.targetHours} ساعة`
                  : undefined;

              return (
                <article
                  key={cert.id}
                  className={`border p-5 bg-molim-surface transition ${
                    isEligible ? "border-[#ed542f]/40" : "border-molim"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center text-2xl ${
                        isEligible ? "bg-[#ed542f]/10" : "bg-molim-soft"
                      }`}
                    >
                      {cert.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-bold text-molim-foreground">
                          {cert.title}
                        </h3>

                        <span
                          className={`shrink-0 px-2.5 py-1 text-xs font-semibold ${
                            isEligible
                              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                              : "bg-molim-soft text-molim-muted"
                          }`}
                        >
                          {isEligible ? "مؤهل" : "غير مؤهل"}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-6 text-molim-muted">
                        {cert.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-molim pt-3">
                    <p className="text-[11px] text-molim-muted">شرط الاستحقاق</p>
                    <p className="mt-1 text-xs font-bold text-molim-foreground">
                      {cert.requirement}
                    </p>

                    {progressText && (
                      <p
                        className={`mt-1 text-xs font-bold ${
                          isEligible ? "text-green-600 dark:text-green-400" : "text-[#ed542f]"
                        }`}
                      >
                        {progressText}
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    {existing ? (
                      <div className="border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-900 dark:bg-blue-950/40">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                            ✓ طلبك مسجل: {CERTIFICATE_STATUS_TO_ARABIC[existing.status] || existing.status}
                          </p>
                          <span
                            className={`border px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeStyle(
                              existing.status
                            )}`}
                          >
                            {CERTIFICATE_STATUS_TO_ARABIC[existing.status] || existing.status}
                          </span>
                        </div>
                        {existing.notes && (
                          <p className="mt-1.5 text-xs text-blue-800 dark:text-blue-200">
                            ملاحظة: {existing.notes}
                          </p>
                        )}
                      </div>
                    ) : isEligible ? (
                      <button
                        type="button"
                        disabled={isSubmitting || loading}
                        onClick={() => handleRequest(cert.id)}
                        className="h-11 w-full bg-[#ed542f] text-sm font-bold text-white transition hover:bg-[#d94725] disabled:opacity-60 cursor-pointer"
                      >
                        {isSubmitting ? "جاري إرسال الطلب..." : "طلب الشهادة"}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between border border-molim bg-molim-soft px-4 py-3 text-xs text-molim-muted">
                        <span>لم تستوفِ شروط الاستحقاق بعد</span>
                        <span>🔒</span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {/* قسم خطاب التوصية */}
          <section className="mb-8">
            <div className="mb-3">
              <h2 className="text-lg font-black text-molim-foreground">
                ✉️ خطاب التوصية
              </h2>
              <p className="mt-1 text-xs leading-6 text-molim-muted">
                خطاب التوصية يعتمد على مدة مشاركتك وجودة الأداء وتقييم المسؤول المختص.
              </p>
            </div>

            <article className="border border-molim bg-molim-surface p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#ed542f]/10 text-2xl">
                  ✉️
                </div>

                <div>
                  <h3 className="text-base font-bold text-molim-foreground">
                    طلب خطاب توصية
                  </h3>
                  <p className="mt-1 text-xs leading-6 text-molim-muted">
                    يمكنك تقديم طلب خطاب توصية، وسيتم تقييم طلبك بناءً على مشاركتك وأدائك داخل الفريق.
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-molim pt-3">
                <p className="text-[11px] font-bold text-molim-muted">يعتمد الطلب على</p>
                <ul className="mt-2 space-y-1.5 text-xs text-molim-muted">
                  <li className="flex items-center gap-2">
                    <span className="text-[#ed542f] font-bold">✓</span>
                    وجود فترة تطوع فعلية داخل فريق مُلم
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#ed542f] font-bold">✓</span>
                    وجود مهام وساعات تطوعية معتمدة
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#ed542f] font-bold">✓</span>
                    تقييم رئيس القسم أو المسؤول المباشر
                  </li>
                </ul>
              </div>

              <div className="mt-5">
                {recommendationRequest ? (
                  <div className="border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                        ✓ طلب خطاب التوصية مسجل
                      </p>
                      <span
                        className={`border px-2 py-0.5 text-xs font-medium ${getStatusBadgeStyle(
                          recommendationRequest.status
                        )}`}
                      >
                        {CERTIFICATE_STATUS_TO_ARABIC[recommendationRequest.status] ||
                          recommendationRequest.status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-300">
                      سيتم مراجعة طلبك من الموارد البشرية والجهة المختصة.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={submittingType === "recommendation_letter" || loading}
                    onClick={() => handleRequest("recommendation_letter")}
                    className="h-11 w-full bg-[#ed542f] text-sm font-bold text-white transition hover:bg-[#d94725] disabled:opacity-60 cursor-pointer"
                  >
                    {submittingType === "recommendation_letter"
                      ? "جاري إرسال الطلب..."
                      : "طلب خطاب التوصية"}
                  </button>
                )}
              </div>
            </article>
          </section>

          {/* سجل الطلبات السابقة */}
          <section className="mb-8 border border-molim bg-molim-surface p-5">
            <div className="flex items-center justify-between border-b border-molim pb-3">
              <div>
                <h3 className="text-base font-bold text-molim-foreground">طلباتك</h3>
                <p className="text-xs text-molim-muted">
                  متابعة الطلبات السابقة الخاصة بالشهادات والخطابات.
                </p>
              </div>
              <span className="text-xs font-bold text-molim-muted">
                {requests.length} طلبات
              </span>
            </div>

            {requests.length === 0 ? (
              <p className="py-6 text-center text-xs text-molim-muted">
                لا توجد طلبات سابقة حتى الآن.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-molim">
                {requests.map((req) => (
                  <div key={req.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-molim-foreground">
                          {CERTIFICATE_TYPE_TO_ARABIC[req.type] || req.type}
                        </p>
                        <p className="mt-1 text-[11px] text-molim-muted">
                          تاريخ الطلب: {req.request_date || "—"} | الساعات: {req.hours || 0}
                        </p>
                        {req.notes && (
                          <p className="mt-1 text-xs text-molim-muted">
                            الملاحظات: {req.notes}
                          </p>
                        )}
                      </div>

                      <span
                        className={`border px-2.5 py-1 text-xs font-medium ${getStatusBadgeStyle(
                          req.status
                        )}`}
                      >
                        {CERTIFICATE_STATUS_TO_ARABIC[req.status] || req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </RoleGuard>
  );
}