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

const durations = [
  {
    value: "1",
    title: "شهر واحد",
    description: "اتفاقية تطوع لمدة شهر واحد",
  },
  {
    value: "2",
    title: "شهران",
    description: "اتفاقية تطوع لمدة شهرين",
  },
  {
    value: "3",
    title: "ثلاثة أشهر",
    description: "الحد الأقصى لمدة الاتفاقية",
  },
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

  // حالة الاتفاقية (الخطوة 3)
  const [agreementDuration, setAgreementDuration] = useState("");
  const [agreementAgreed, setAgreementAgreed] = useState(false);

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

  // التحقق من الخطوة 2
  function validateStep2(): boolean {
    const step2Errs: Record<string, string> = {};
    if (form.skills.length === 0) {
      step2Errs.skills = "يرجى اختيار مهارة واحدة على الأقل.";
    }
    if (form.tools.length === 0) {
      step2Errs.tools = "يرجى اختيار أداة أو برنامج واحد على الأقل.";
    }

    if (Object.keys(step2Errs).length > 0) {
      setFieldErrors(step2Errs);
      setError("يرجى تحديد مهاراتك وأدواتك قبل المتابعة.");
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

  // الانتقال للخطوة 3 (الاتفاقية)
  function handleGoToStep3() {
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      return;
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // حفظ نهائي (يشمل الملف الشخصي + الاتفاقية)
  async function handleSubmit() {
    if (submitting) return;

    if (!validateStep1()) {
      setStep(1);
      return;
    }

    if (!validateStep2()) {
      setStep(2);
      return;
    }

    // التحقق من مدة الاتفاقية والموافقة
    if (!agreementDuration) {
      setError("يرجى اختيار مدة اتفاقية التطوع (شهر، شهران، أو ثلاثة أشهر).");
      return;
    }

    if (!agreementAgreed) {
      setError("يرجى قراءة الاتفاقية وتأكيد الموافقة عليها بالضغط على مربع الإقرار.");
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
      agreementDuration: Number(agreementDuration),
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || "تعذر حفظ بياناتك.");
      return;
    }

    refreshAuth();
    router.replace("/");
  }

  const fullName = [form.firstName, form.fatherName, form.lastName]
    .filter(Boolean)
    .join(" ");

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
            الخطوة {step} من 3
          </span>
        </header>

        {/* مؤشر التقدم */}
        <div className="mt-5 flex gap-2">
          {[1, 2, 3].map((item) => (
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
              الخطوة 1: البيانات الأساسية
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
                placeholder="مثال: عبد الرحمن"
                value={form.firstName}
                error={fieldErrors.firstName}
                onChange={(val) => updateField("firstName", val)}
              />

              {/* اسم الأب */}
              <Input
                label="اسم الأب (باللغة العربية)"
                required
                placeholder="مثال: عبد الله"
                value={form.fatherName}
                error={fieldErrors.fatherName}
                onChange={(val) => updateField("fatherName", val)}
              />

              {/* اسم العائلة */}
              <Input
                label="اسم العائلة (باللغة العربية)"
                required
                placeholder="مثال: الغامدي"
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
              الخطوة 2: المهارات والأدوات
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
                onClick={handleGoToStep3}
                className="h-14 cursor-pointer bg-[#ed542f] text-sm font-black text-white shadow-sm transition hover:bg-[#d84824] active:scale-[0.99]"
              >
                متابعة إلى الاتفاقية
              </button>
            </div>
          </section>
        )}

        {/* الخطوة الثالثة: اتفاقية التطوع */}
        {step === 3 && (
          <section className="mt-8">
            <p className="text-xs font-black tracking-wide text-[#ed542f]">
              الخطوة 3 والأخيرة: اتفاقية التطوع
            </p>

            <h2 className="mt-2 text-2xl font-black leading-tight text-molim-foreground">
              اتفاقية التطوع — فريق مُلم
            </h2>

            <p className="mt-2 text-xs leading-6 text-molim-muted">
              يرجى قراءة بنود الاتفاقية واختيار مدة التطوع المناسبة لك (شهر، شهران، أو ثلاثة أشهر)، ثم تأكيد موافقتك لاعتماد حسابك.
            </p>

            {/* بيانات الوثيقة والطرفين */}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <div className="border border-molim bg-molim-soft p-3.5">
                <p className="text-[10px] text-molim-muted">الطرف الأول</p>
                <p className="mt-1 text-xs font-black text-molim-foreground">
                  فريق مُلم (الإدارة)
                </p>
              </div>

              <div className="border border-molim bg-molim-soft p-3.5">
                <p className="text-[10px] text-molim-muted">الطرف الثاني</p>
                <p className="mt-1 text-xs font-black text-molim-foreground truncate">
                  {fullName || "المتطوع"}
                </p>
              </div>
            </div>

            {/* نص بنود الاتفاقية الكامل */}
            <div className="mt-4 border border-molim bg-molim-soft">
              <div className="border-b border-molim px-4 py-3">
                <p className="text-xs font-black text-molim-foreground">
                  وثيقة اتفاقية التطوع الرسمية
                </p>
              </div>

              <article className="max-h-[380px] overflow-y-auto px-4 py-4 text-justify">
                <div className="space-y-5 text-xs leading-7 text-molim-muted">
                  <section>
                    <h4 className="font-black text-molim-foreground">
                      أولًا: التمهيد والإقرار
                    </h4>
                    <p className="mt-1">
                      بناءً على رغبة الطرف الثاني في الانضمام إلى فريق مُلم والمساهمة في تحقيق أهدافه من خلال العمل التطوعي، يقر الطرف الثاني بأنه اطلع على هذه الوثيقة وفهم جميع بنودها، ويتعهد بالالتزام الكامل بسياسات ولوائح فريق مُلم وأداء المهام الموكلة إليه بأمانة ومسؤولية.
                    </p>
                  </section>

                  <section>
                    <h4 className="font-black text-molim-foreground">
                      ثانيًا: التزامات وواجبات المتطوع
                    </h4>
                    <p className="mt-1">
                      يقر المتطوع بأن مشاركته تطوعية بالكامل وغير مدفوعة الأجر ولا يترتب عليها أي التزام مالي. يلتزم بإنجاز المهام المسندة إليه ضمن المواعيد المحددة وإبلاغ الإدارة بأي طارئ. كما يلتزم بالمحافظة التامة على سرية كافة بيانات ووثائق الفريق.
                    </p>
                  </section>

                  <section>
                    <h4 className="font-black text-molim-foreground">
                      ثالثًا: حقوق المتطوع
                    </h4>
                    <p className="mt-1">
                      يلتزم فريق مُلم بتوفير بيئة تطوعية محفزة وحفظ بيانات المتطوع. ويحق للمتطوع توثيق مساهماته والاستفادة من الساعات والشهادات المعتمدة وفق لوائح المنصة.
                    </p>
                  </section>

                  <section>
                    <h4 className="font-black text-molim-foreground">
                      رابعًا: المهام والساعات
                    </h4>
                    <p className="mt-1">
                      يتم إسناد المهام وتسجيل الساعات من خلال منصة مُلم وتعتمد وفق إجراءات المراجعة المعتمدة.
                    </p>
                  </section>

                  <section>
                    <h4 className="font-black text-molim-foreground">
                      خامسًا: مدة الاتفاقية وتجديدها
                    </h4>
                    <p className="mt-1">
                      تبدأ الاتفاقية من تاريخ الموافقة عليها، وتكون مدتها حسب الاختيار المعتمد أدناه (شهر واحد، شهران، أو ثلاثة أشهر). ويمكن للمتطوع تجديد الاتفاقية لاحقاً عبر المنصة.
                    </p>
                  </section>

                  <section>
                    <h4 className="font-black text-molim-foreground">
                      سادسًا: إنهاء التطوع
                    </h4>
                    <p className="mt-1">
                      في حال الرغبة في إنهاء التطوع، يتعين على المتطوع إشعار الإدارة مسبقاً لتسليم المهام المعلقة.
                    </p>
                  </section>
                </div>
              </article>
            </div>

            {/* اختيار مدة الاتفاقية */}
            <div className="mt-6">
              <h3 className="text-xs font-black text-molim-foreground">
                اختر مدة الاتفاقية <span className="text-[#ed542f]">*</span>
              </h3>

              <div className="mt-3 space-y-2">
                {durations.map((item) => {
                  const selected = agreementDuration === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setAgreementDuration(item.value);
                        if (error) setError("");
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3 border p-3.5 text-right transition ${
                        selected
                          ? "border-[#ed542f] bg-[#ed542f]/5"
                          : "border-molim bg-molim-soft hover:bg-white"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? "border-[#ed542f]" : "border-molim"
                        }`}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-[#ed542f]" />
                        )}
                      </span>

                      <div className="flex-1">
                        <span className="block text-xs font-black text-molim-foreground">
                          {item.title}
                        </span>
                        <span className="block text-[11px] text-molim-muted">
                          {item.description}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* إقرار الموافقة */}
            <div className="mt-5 border border-molim bg-molim-soft p-3.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={agreementAgreed}
                  onChange={(e) => {
                    setAgreementAgreed(e.target.checked);
                    if (error) setError("");
                  }}
                  className="mt-0.5 h-4 w-4 accent-[#ed542f]"
                />

                <span className="text-xs leading-5 text-molim-foreground font-semibold">
                  أقر بأنني قرأت اتفاقية التطوع كاملة، وفهمت جميع بنودها، واخترت مدة الاتفاقية، وأوافق على الالتزام بها وبسياسات ولوائح فريق مُلم. <span className="text-[#ed542f]">*</span>
                </span>
              </label>
            </div>

            {/* أزرار الحفظ والاعتماد */}
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(2);
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
                {submitting ? "جاري الاعتماد..." : "أوافق وأكمل الانضمام"}
              </button>
            </div>
          </section>
        )}

        {/* رسالة إرشادية حول إلزامية إكمال الملف والاتفاقية */}
        <div className="mt-8 rounded-lg border border-[#ed542f]/20 bg-[#ed542f]/5 p-3.5 text-center">
          <p className="text-[11px] leading-5 text-molim-muted">
            🔒 إكمال الملف الشخصي وتوقيع الاتفاقية إلزامي لاعتماد عضويتك والبدء في استلام المهام داخل المنصة.
          </p>
        </div>

        <footer className="mt-6 border-t border-molim pt-5 text-center">
          <p className="text-[11px] text-molim-muted">
            منصة مُلم — إكمال بيانات وعضوية المتطوع
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
