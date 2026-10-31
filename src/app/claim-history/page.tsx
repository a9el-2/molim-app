"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageShell from "../components/PageShell";
import PageTitle from "../components/PageTitle";
import Card from "../components/Card";
import Button from "../components/Button";
import {
  previewHistory,
  claimHistory,
  type HistoryPreviewDTO,
} from "../lib/supabase/dto";

// ─────────────────────────────────────────────────────────────
// أنواع
// ─────────────────────────────────────────────────────────────
type PreviewData = HistoryPreviewDTO;

type Step = "input" | "preview" | "success";

// ─────────────────────────────────────────────────────────────
// دوال مساعدة
// ─────────────────────────────────────────────────────────────
function formatHours(h: number): string {
  if (h === Math.floor(h)) return `${h} ساعة`;
  return `${h} ساعة`;
}

// ─────────────────────────────────────────────────────────────
// الصفحة الرئيسية
// ─────────────────────────────────────────────────────────────
export default function ClaimHistoryPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successSummary, setSuccessSummary] = useState<{
    volunteerName: string;
    totalHours: number;
    tasksCount: number;
  } | null>(null);
  // ── خطوة 1: معاينة البيانات ──────────────────────────────
  const handlePreview = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) { setError("فضلاً أدخل رمز الاستعادة."); return; }
    setError("");
    setLoading(true);
    try {
      const result = await previewHistory(trimmed);
      if (!result.ok) { setError(result.error); return; }
      setPreview(result.data);
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [code]);

  // ── خطوة 2: تأكيد الاستعادة ─────────────────────────────
  const handleClaim = useCallback(async () => {
    if (!preview) return;
    setError("");
    setLoading(true);
    try {
      const result = await claimHistory(code.trim());
      if (!result.ok) { setError(result.error); return; }
      // الـ API يُرجع volunteerName لكن نعرض name من الـ preview
      setSuccessSummary({
        volunteerName: result.summary.volunteerName,
        totalHours: result.summary.totalHours,
        tasksCount: result.summary.tasksCount,
      });
      setStep("success");
    } finally {
      setLoading(false);
    }
  }, [code, preview]);

  return (
    <PageShell>
      <div className="mx-auto max-w-lg px-4 pb-16 pt-4">
        <PageTitle
          title="استعادة السجل التاريخي"
          description="أدخل رمزك الخاص لاسترداد مهامك وساعاتك التطوعية السابقة"
        />

        {/* ── خطوة 1: إدخال الرمز ── */}
        {step === "input" && (
          <Card className="mt-6 space-y-5 p-5">
            <div>
              <p className="mb-4 text-sm leading-7 text-molim-muted">
                إذا كنت متطوعاً في مُلَم قبل إطلاق النظام الجديد، يمكنك استعادة
                مهامك وساعاتك التطوعية المسجّلة سابقاً عبر إدخال رمز الاستعادة
                الخاص بك.
              </p>

              <label
                htmlFor="access-code"
                className="mb-2 block text-xs font-black text-molim-foreground"
              >
                رمز الاستعادة
              </label>
              <input
                id="access-code"
                type="text"
                dir="ltr"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePreview(); }}
                placeholder="مثال: 8gVp12hJ6"
                className="w-full border border-molim bg-molim-soft px-3 py-2.5 text-sm font-mono text-molim-foreground placeholder:text-molim-muted focus:outline-none focus:ring-1 focus:ring-molim-orange"
                autoComplete="off"
              />

              {error && (
                <p className="mt-2 text-xs font-bold text-red-500">{error}</p>
              )}
            </div>

            <Button
              onClick={handlePreview}
              disabled={loading || !code.trim()}
              className="w-full"
            >
              {loading ? "جارٍ البحث..." : "بحث عن سجلي"}
            </Button>
          </Card>
        )}

        {/* ── خطوة 2: معاينة البيانات ── */}
        {step === "preview" && preview && (
          <div className="mt-6 space-y-4">
            {/* إذا كان مُستعاداً مسبقاً */}
            {preview.alreadyClaimed && !preview.claimedByMe && (
              <Card className="border-red-300 bg-red-50 p-4">
                <p className="text-sm font-bold text-red-600">
                  ⚠️ تم استعادة هذا الرمز بواسطة حساب آخر.
                </p>
              </Card>
            )}
            {preview.claimedByMe && (
              <Card className="border-green-300 bg-green-50 p-4">
                <p className="text-sm font-bold text-green-700">
                  ✅ لقد استعدت هذا السجل مسبقاً. مهامك وساعاتك موجودة في حسابك.
                </p>
              </Card>
            )}

            {/* بطاقة الملخص */}
            <Card className="p-5">
              <h2 className="text-base font-black text-molim-foreground">
                {preview.name}
              </h2>
              <div className="mt-3 flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-black text-molim-orange">
                    {formatHours(preview.totalHours)}
                  </p>
                  <p className="text-xs text-molim-muted">إجمالي الساعات</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-molim-foreground">
                    {preview.tasksCount}
                  </p>
                  <p className="text-xs text-molim-muted">مهمة منجزة</p>
                </div>
              </div>
            </Card>

            {/* قائمة أول 10 مهام */}
            {preview.tasks.length > 0 && (
              <Card className="p-5">
                <h3 className="mb-3 text-xs font-black text-molim-foreground">
                  المهام السابقة {preview.tasksCount > 10 ? `(أول 10 من ${preview.tasksCount})` : ""}
                </h3>
                <ul className="space-y-2">
                  {preview.tasks.map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between border-b border-molim/30 pb-2 last:border-0 last:pb-0"
                    >
                      <span className="text-xs text-molim-foreground">{t.title}</span>
                      <span className="shrink-0 text-xs font-bold text-molim-orange">
                        {formatHours(t.hours)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {error && (
              <p className="text-xs font-bold text-red-500">{error}</p>
            )}

            {/* أزرار */}
            {!preview.alreadyClaimed && !preview.claimedByMe && (
              <Button
                onClick={handleClaim}
                disabled={loading}
                className="w-full"
              >
                {loading ? "جارٍ الاستعادة..." : `استعادة ${preview.tasksCount} مهمة وسجل الساعات`}
              </Button>
            )}

            <button
              onClick={() => { setStep("input"); setCode(""); setPreview(null); setError(""); }}
              className="w-full py-2 text-xs text-molim-muted underline"
            >
              إدخال رمز آخر
            </button>
          </div>
        )}

        {/* ── خطوة 3: نجاح الاستعادة ── */}
        {step === "success" && successSummary && (
          <div className="mt-6 space-y-4">
            <Card className="p-6 text-center">
              <div className="mb-4 text-4xl">🎉</div>
              <h2 className="text-lg font-black text-molim-foreground">
                تمّت الاستعادة بنجاح!
              </h2>
              <p className="mt-2 text-sm text-molim-muted">
                تم استعادة سجلك التاريخي وربطه بحسابك.
              </p>

              <div className="mt-5 flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-3xl font-black text-molim-orange">
                    {formatHours(successSummary.totalHours)}
                  </p>
                  <p className="text-xs text-molim-muted">ساعات مُضافة</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black text-molim-foreground">
                    {successSummary.tasksCount}
                  </p>
                  <p className="text-xs text-molim-muted">مهمة مُسترجعة</p>
                </div>
              </div>
            </Card>

            <Button onClick={() => router.push("/work")} className="w-full">
              عرض مهامي
            </Button>

            <Button
              onClick={() => router.push("/dashboard")}
              className="w-full"
              style={{ background: "transparent", border: "1px solid var(--molim)" }}
            >
              الصفحة الرئيسية
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
