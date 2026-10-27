"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { completeProfile } from "../lib/supabase/dto";
import { useAuth } from "../lib/auth-context";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  searchCountries,
  type CountryItem,
} from "../lib/countries-data";

const skills = [
  "القيادة",
  "إدارة الفريق",
  "التنظيم",
  "التواصل",
  "العمل الجماعي",
  "إدارة الوقت",
  "التخطيط",
  "حل المشكلات",
  "البحث",
  "كتابة المحتوى",
  "التصميم",
  "التصوير",
  "المونتاج",
  "صناعة المحتوى",
  "التسويق",
  "العلاقات العامة",
  "إدارة الحسابات",
  "إدارة المشاريع",
  "الترجمة",
  "البرمجة",
];

const tools = [
  "Canva",
  "Photoshop",
  "Illustrator",
  "Premiere Pro",
  "After Effects",
  "Figma",
  "Microsoft Word",
  "Microsoft Excel",
  "PowerPoint",
  "Notion",
  "Telegram",
  "GitHub",
  "ChatGPT",
];

type PickerMode = "countryCode" | "nationality" | "residence" | null;

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, refreshAuth } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const [form, setForm] = useState({
    firstName: "",
    fatherName: "",
    lastName: "",
    email: user.email ?? "",
    phone: "",
    countryCode: DEFAULT_COUNTRY.dialCode, // +966
    birthDate: "",
    nationality: "",
    residence: "",
    skills: [] as string[],
    tools: [] as string[],
  });

  // مزامنة مبدئية مع بيانات المستخدم إذا توفرت من الحساب
  useEffect(() => {
    if (user.phone && !form.phone) {
      const raw = user.phone.trim();
      const matched = COUNTRIES.find((c) => raw.startsWith(c.dialCode));
      if (matched) {
        setForm((prev) => ({
          ...prev,
          countryCode: matched.dialCode,
          phone: raw.slice(matched.dialCode.length).replace(/[^\d]/g, ""),
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          phone: raw.replace(/[^\d]/g, ""),
        }));
      }
    }

    if (user.email && !form.email) {
      setForm((prev) => ({ ...prev, email: user.email! }));
    }

    if (user.name && !form.firstName) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length === 1) {
        setForm((prev) => ({ ...prev, firstName: parts[0] }));
      } else if (parts.length === 2) {
        setForm((prev) => ({
          ...prev,
          firstName: parts[0],
          lastName: parts[1],
        }));
      } else if (parts.length >= 3) {
        setForm((prev) => ({
          ...prev,
          firstName: parts[0],
          fatherName: parts[1],
          lastName: parts.slice(2).join(" "),
        }));
      }
    }
  }, [user.phone, user.email, user.name]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (error) setError("");
  };

  const toggleItem = (field: "skills" | "tools", value: string) => {
    setForm((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (error) setError("");
  };

  // الدولة المختارة حالياً للرمز والجنسية والإقامة
  const selectedCountryCodeItem = useMemo(() => {
    return (
      COUNTRIES.find((c) => c.dialCode === form.countryCode) ?? DEFAULT_COUNTRY
    );
  }, [form.countryCode]);

  const selectedNationalityItem = useMemo(() => {
    return (
      COUNTRIES.find(
        (c) =>
          c.nationalityAr === form.nationality || c.nameAr === form.nationality
      ) ?? null
    );
  }, [form.nationality]);

  const selectedResidenceItem = useMemo(() => {
    return COUNTRIES.find((c) => c.nameAr === form.residence) ?? null;
  }, [form.residence]);

  // التحقق من الحقول الإلزامية في الخطوة 1
  function validateStep1(): boolean {
    const errs: Record<string, string> = {};

    if (!form.firstName.trim()) {
      errs.firstName = "الاسم الأول مطلوب.";
    }
    if (!form.fatherName.trim()) {
      errs.fatherName = "اسم الأب مطلوب.";
    }
    if (!form.lastName.trim()) {
      errs.lastName = "اسم العائلة مطلوب.";
    }

    if (!form.email.trim()) {
      errs.email = "البريد الإلكتروني مطلوب.";
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      errs.email = "صيغة البريد الإلكتروني غير صحيحة.";
    }

    if (!form.countryCode.trim()) {
      errs.countryCode = "رمز الدولة مطلوب.";
    }

    const cleanPhone = form.phone.replace(/[^\d]/g, "");
    if (!cleanPhone) {
      errs.phone = "رقم الهاتف مطلوب.";
    } else if (cleanPhone.length < 7) {
      errs.phone = "رقم الهاتف يجب أن يتكون من 7 أرقام على الأقل.";
    }

    if (!form.birthDate.trim()) {
      errs.birthDate = "تاريخ الميلاد مطلوب.";
    } else {
      const birth = new Date(form.birthDate);
      const now = new Date();
      if (birth > now) {
        errs.birthDate = "تاريخ الميلاد لا يمكن أن يكون في المستقبل.";
      }
    }

    if (!form.nationality.trim()) {
      errs.nationality = "الجنسية مطلوبة.";
    }

    if (!form.residence.trim()) {
      errs.residence = "بلد الإقامة مطلوب.";
    }

    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setError("يرجى ملء جميع الحقول الإلزامية المطلوبة للمتابعة.");
      return false;
    }

    setError("");
    return true;
  }

  // الانتقال للخطوة 2
  function handleGoToStep2() {
    if (!validateStep1()) {
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // حفظ نهائي
  async function handleSubmit() {
    if (submitting) return;

    // إعادة فحص الخطوة الأولى
    if (!validateStep1()) {
      setStep(1);
      return;
    }

    // فحص الخطوة الثانية
    const step2Errs: Record<string, string> = {};
    if (form.skills.length === 0) {
      step2Errs.skills = "يرجى اختيار مهارة واحدة على الأقل.";
    }
    if (form.tools.length === 0) {
      step2Errs.tools = "يرجى اختيار أداة أو برنامج واحد على الأقل.";
    }

    if (Object.keys(step2Errs).length > 0) {
      setFieldErrors(step2Errs);
      setError("يرجى تحديد مهاراتك وأدواتك قبل إكمال الملف.");
      return;
    }

    setError("");
    setSubmitting(true);

    const result = await completeProfile({
      firstName: form.firstName.trim(),
      fatherName: form.fatherName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      countryCode: form.countryCode.trim(),
      birthDate: form.birthDate.trim(),
      nationality: form.nationality.trim(),
      residence: form.residence.trim(),
      skills: form.skills,
      tools: form.tools,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || "تعذر حفظ بياناتك.");
      return;
    }

    refreshAuth();
    router.replace("/");
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-molim-soft text-molim-foreground"
    >
      <div className="relative mx-auto max-w-md px-5 pb-12 pt-7">
        <header className="flex items-center justify-between border-b border-[#202124]/10 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="شعار مُلم"
              className="h-11 w-11 rounded-lg object-contain"
            />

            <div>
              <p className="text-[11px] leading-tight text-molim-muted">منصة الفريق</p>
              <h1 className="text-lg font-black leading-tight text-molim-foreground">مُلم</h1>
            </div>
          </div>

          <span className="text-xs font-bold text-molim-muted">
            الخطوة {step} من 2
          </span>
        </header>

        {/* مؤشر التقدم */}
        <div className="mt-5 flex gap-2">
          {[1, 2].map((item) => (
            <div
              key={item}
              className={`h-1.5 flex-1 transition-all ${
                item <= step ? "bg-[#ed542f]" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* تنبيه الخطأ العام إن وجد */}
        {error && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* الخطوة الأولى: البيانات الشخصية */}
        {step === 1 && (
          <section className="mt-8">
            <p className="text-xs font-black tracking-wide text-[#ed542f]">
              البيانات الأساسية
            </p>

            <h2 className="mt-2 text-2xl font-black leading-tight text-molim-foreground">
              أكمل بياناتك الشخصية
            </h2>

            <p className="mt-2 text-xs leading-6 text-molim-muted">
              عضويتك أُضيفت من قبل الإدارة. يرجى إدخال جميع البيانات المطلوبة بدقة لاعتماد ملفك. جميع الحقول بعلامة (<span className="text-[#ed542f] font-bold">*</span>) إجبارية.
            </p>

            <div className="mt-7 space-y-4">
              {/* الاسم الأول */}
              <Input
                label="الاسم الأول (باللغة العربية)"
                required
                placeholder="مثال:اصيل "
                value={form.firstName}
                error={fieldErrors.firstName}
                onChange={(val) => updateField("firstName", val)}
              />

              {/* اسم الأب */}
              <Input
                label="اسم الأب (باللغة العربية)"
                required
                placeholder="مثال: محمد "
                value={form.fatherName}
                error={fieldErrors.fatherName}
                onChange={(val) => updateField("fatherName", val)}
              />

              {/* اسم العائلة */}
              <Input
                label="اسم العائلة (باللغة العربية)"
                required
                placeholder="مثال: الصلوي "
                value={form.lastName}
                error={fieldErrors.lastName}
                onChange={(val) => updateField("lastName", val)}
              />

              {/* البريد الإلكتروني */}
              <Input
                label="البريد الإلكتروني"
                required
                type="email"
                placeholder="name@example.com"
                value={form.email}
                error={fieldErrors.email}
                onChange={(val) => updateField("email", val)}
              />

              {/* رقم الهاتف مع رمز الدولة والبحث */}
              <div>
                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-molim-foreground">
                    <span>
                      رقم الهاتف <span className="text-[#ed542f]">*</span>
                    </span>
                    <span className="text-[11px] font-normal text-molim-muted">
                      انقر على العلم/الرمز للبحث وتغيير الدولة
                    </span>
                  </div>

                  <div
                    className={`flex items-stretch border bg-molim-soft transition ${
                      fieldErrors.phone || fieldErrors.countryCode
                        ? "border-red-500 bg-red-50/20"
                        : "border-molim focus-within:border-[#ed542f]"
                    }`}
                  >
                    {/* زر رمز الدولة */}
                    <button
                      type="button"
                      onClick={() => setPickerMode("countryCode")}
                      className="flex cursor-pointer select-none items-center gap-1.5 border-l border-molim bg-white/70 px-3 text-xs font-black text-molim-foreground transition hover:bg-white active:bg-gray-100"
                      title="اختر رمز الدولة"
                    >
                      <span className="text-base leading-none">
                        {selectedCountryCodeItem?.flag ?? "🇸🇦"}
                      </span>
                      <span
                        dir="ltr"
                        className="font-mono text-xs font-black text-molim-foreground"
                      >
                        {form.countryCode || "+966"}
                      </span>
                      <span className="text-[10px] text-molim-muted">▼</span>
                    </button>

                    {/* حقل رقم الهاتف */}
                    <input
                      type="tel"
                      dir="ltr"
                      placeholder="5XXXXXXXX"
                      value={form.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d]/g, "");
                        updateField("phone", val);
                      }}
                      className="h-14 flex-1 bg-transparent px-4 text-left font-mono text-sm text-molim-foreground outline-none placeholder:text-right placeholder:font-sans placeholder:text-molim-muted"
                    />
                  </div>
                </label>
                {fieldErrors.phone && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              {/* تاريخ الميلاد */}
              <Input
                label="تاريخ الميلاد"
                required
                type="date"
                value={form.birthDate}
                error={fieldErrors.birthDate}
                onChange={(val) => updateField("birthDate", val)}
              />

              {/* الجنسية */}
              <SelectTrigger
                label="الجنسية"
                required
                placeholder="اختر الجنسية (باللغة العربية)"
                value={form.nationality}
                flag={selectedNationalityItem?.flag}
                error={fieldErrors.nationality}
                onClick={() => setPickerMode("nationality")}
              />

              {/* بلد الإقامة */}
              <SelectTrigger
                label="بلد الإقامة"
                required
                placeholder="اختر بلد الإقامة (باللغة العربية)"
                value={form.residence}
                flag={selectedResidenceItem?.flag}
                error={fieldErrors.residence}
                onClick={() => setPickerMode("residence")}
              />
            </div>

            <button
              type="button"
              onClick={handleGoToStep2}
              className="mt-8 flex h-14 w-full cursor-pointer items-center justify-center bg-[#ed542f] text-sm font-black text-white shadow-sm transition hover:bg-[#d84824] active:scale-[0.99]"
            >
              متابعة إلى المهارات والأدوات
            </button>
          </section>
        )}

        {/* الخطوة الثانية: المهارات والأدوات */}
        {step === 2 && (
          <section className="mt-8">
            <p className="text-xs font-black tracking-wide text-[#ed542f]">
              مهاراتك وأدواتك
            </p>

            <h2 className="mt-2 text-2xl font-black leading-tight text-molim-foreground">
              وش تقدر تقدم لمُلم؟
            </h2>

            <p className="mt-2 text-xs leading-6 text-molim-muted">
              يرجى اختيار مهاراتك والأدوات والبرامج التي تجيد استخدامها (<span className="text-[#ed542f] font-bold">* اختيار واحد على الأقل إلزامي</span>).
            </p>

            {/* المهارات */}
            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-black text-molim-foreground">
                  المهارات <span className="text-[#ed542f]">*</span>
                </p>
                {form.skills.length > 0 && (
                  <span className="text-[11px] font-bold text-[#ed542f]">
                    تم اختيار {form.skills.length}
                  </span>
                )}
              </div>

              {fieldErrors.skills && (
                <p className="mb-2.5 text-xs font-semibold text-red-600">
                  {fieldErrors.skills}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => {
                  const selected = form.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleItem("skills", skill)}
                      className={`cursor-pointer border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? "border-[#ed542f] bg-[#ed542f] text-white"
                          : "border-molim bg-molim-soft text-molim-foreground hover:border-[#ed542f]/40"
                      }`}
                    >
                      {skill} {selected && "✓"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* الأدوات والبرامج */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-black text-molim-foreground">
                  الأدوات والبرامج <span className="text-[#ed542f]">*</span>
                </p>
                {form.tools.length > 0 && (
                  <span className="text-[11px] font-bold text-[#ed542f]">
                    تم اختيار {form.tools.length}
                  </span>
                )}
              </div>

              {fieldErrors.tools && (
                <p className="mb-2.5 text-xs font-semibold text-red-600">
                  {fieldErrors.tools}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => {
                  const selected = form.tools.includes(tool);
                  return (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => toggleItem("tools", tool)}
                      className={`cursor-pointer border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? "border-[#ed542f] bg-[#ed542f] text-white"
                          : "border-molim bg-molim-soft text-molim-foreground hover:border-[#ed542f]/40"
                      }`}
                    >
                      {tool} {selected && "✓"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="h-14 cursor-pointer border border-molim bg-molim-soft text-sm font-black text-molim-foreground transition hover:bg-gray-100"
              >
                رجوع
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="h-14 cursor-pointer bg-[#ed542f] text-sm font-black text-white shadow-sm transition hover:bg-[#d84824] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? "جاري الحفظ..." : "حفظ واعتماد ملفي"}
              </button>
            </div>
          </section>
        )}

        {/* رسالة إرشادية حول إلزامية إكمال الملف */}
        <div className="mt-8 rounded-lg border border-[#ed542f]/20 bg-[#ed542f]/5 p-3.5 text-center">
          <p className="text-[11px] leading-5 text-molim-muted">
            🔒 إكمال الملف الشخصي إلزامي لمنحك الصلاحيات والوصول لمهامك في المنصة، ولا يمكن تخطي هذه الخطوة.
          </p>
        </div>

        <footer className="mt-6 border-t border-molim pt-5 text-center">
          <p className="text-[11px] text-molim-muted">
            منصة مُلم — إكمال بيانات العضو
          </p>
        </footer>
      </div>

      {/* نافذة البحث والاختيار المنبثقة (رمز الدولة / الجنسية / بلد الإقامة) */}
      {pickerMode && (
        <CountrySearchModal
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onSelect={(country) => {
            if (pickerMode === "countryCode") {
              updateField("countryCode", country.dialCode);
            } else if (pickerMode === "nationality") {
              updateField("nationality", country.nationalityAr);
            } else if (pickerMode === "residence") {
              updateField("residence", country.nameAr);
            }
            setPickerMode(null);
          }}
        />
      )}
    </main>
  );
}

// مكون إدخال نصي مع تسمية وتنبيه إلزامية ورسالة خطأ
function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-molim-foreground">
        {label} {required && <span className="text-[#ed542f]">*</span>}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`h-14 w-full border bg-molim-soft px-4 text-sm text-molim-foreground outline-none transition placeholder:text-molim-muted/60 ${
          error
            ? "border-red-500 bg-red-50/20"
            : "border-molim focus:border-[#ed542f]"
        }`}
      />

      {error && (
        <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>
      )}
    </label>
  );
}

// زر اختيار تفاعلي يفتح نافذة البحث (للجنسية أو بلد الإقامة)
function SelectTrigger({
  label,
  value,
  placeholder,
  flag,
  required,
  error,
  onClick,
}: {
  label: string;
  value: string;
  placeholder: string;
  flag?: string | null;
  required?: boolean;
  error?: string;
  onClick: () => void;
}) {
  return (
    <div className="block">
      <span className="mb-2 block text-xs font-bold text-molim-foreground">
        {label} {required && <span className="text-[#ed542f]">*</span>}
      </span>

      <button
        type="button"
        onClick={onClick}
        className={`flex h-14 w-full cursor-pointer items-center justify-between border bg-molim-soft px-4 text-sm text-molim-foreground outline-none transition hover:bg-white active:bg-gray-100 ${
          error
            ? "border-red-500 bg-red-50/20"
            : "border-molim hover:border-[#ed542f]/50"
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {value ? (
            <>
              {flag && <span className="text-lg leading-none">{flag}</span>}
              <span className="font-bold text-molim-foreground">{value}</span>
            </>
          ) : (
            <span className="text-molim-muted/60">{placeholder}</span>
          )}
        </div>

        <span className="text-xs text-molim-muted">▼</span>
      </button>

      {error && (
        <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>
      )}
    </div>
  );
}

// نافذة منبثقة للبحث في الدول / الرموز / الجنسيات بالعربي
function CountrySearchModal({
  mode,
  onClose,
  onSelect,
}: {
  mode: "countryCode" | "nationality" | "residence";
  onClose: () => void;
  onSelect: (item: CountryItem) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return searchCountries(search);
  }, [search]);

  const titles = {
    countryCode: "اختر رمز الدولة للاتصال",
    nationality: "اختر الجنسية",
    residence: "اختر بلد الإقامة",
  };

  const placeholders = {
    countryCode: "ابحث باسم الدولة أو رمز الاتصال (مثال: السعودية، 966)...",
    nationality: "ابحث عن الجنسية أو الدولة (مثال: سعودي، مصر)...",
    residence: "ابحث عن بلد الإقامة (مثال: السعودية، الكويت)...",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* رأس النافذة */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-black text-gray-900">{titles[mode]}</h3>
            <p className="text-[11px] text-gray-500">
              {filtered.length} خيار متاح
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* حقل البحث */}
        <div className="border-b border-gray-100 p-3">
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholders[mode]}
              className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-xs text-gray-900 outline-none transition focus:border-[#ed542f] focus:bg-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* قائمة النتائج */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs font-bold text-gray-500">
                لا توجد نتائج مطابقة لبحثك
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                جرب البحث بكلمات أخرى أو بدون همزات
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              if (mode === "countryCode") {
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-right transition hover:bg-orange-50/60 active:bg-orange-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none">{item.flag}</span>
                      <div>
                        <p className="text-xs font-bold text-gray-900">
                          {item.nameAr}
                        </p>
                        <p className="text-[10px] text-gray-400">{item.nameEn}</p>
                      </div>
                    </div>

                    <span
                      dir="ltr"
                      className="rounded bg-gray-100 px-2 py-1 font-mono text-xs font-black text-gray-800"
                    >
                      {item.dialCode}
                    </span>
                  </button>
                );
              }

              if (mode === "nationality") {
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-right transition hover:bg-orange-50/60 active:bg-orange-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none">{item.flag}</span>
                      <div>
                        <p className="text-xs font-black text-gray-900">
                          {item.nationalityAr}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {item.nameAr}
                        </p>
                      </div>
                    </div>

                    <span className="text-[11px] text-gray-400">
                      {item.code}
                    </span>
                  </button>
                );
              }

              // residence
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-right transition hover:bg-orange-50/60 active:bg-orange-100"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl leading-none">{item.flag}</span>
                    <div>
                      <p className="text-xs font-bold text-gray-900">
                        {item.nameAr}
                      </p>
                      <p className="text-[10px] text-gray-400">{item.nameEn}</p>
                    </div>
                  </div>

                  <span className="text-[11px] text-gray-400">
                    {item.code}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
