"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { completeProfile } from "../lib/supabase/dto";
import { useAuth } from "../lib/auth-context";

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

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, refreshAuth } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    fatherName: "",
    lastName: "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    countryCode: "",
    birthDate: "",
    nationality: "",
    residence: "",
    skills: [] as string[],
    tools: [] as string[],
  });

  const updateField = (
    field: keyof typeof form,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
  };

  async function handleSubmit() {
    if (submitting) return;

    if (!form.firstName.trim()) {
      setError("الاسم الأول مطلوب.");
      setStep(1);
      return;
    }

    setError("");
    setSubmitting(true);

    const result = await completeProfile({
      firstName: form.firstName,
      fatherName: form.fatherName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      countryCode: form.countryCode,
      birthDate: form.birthDate,
      nationality: form.nationality,
      residence: form.residence,
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
            <div className="flex h-11 w-11 items-center justify-center bg-[#ed542f] text-xl font-black text-white">
              م
            </div>

            <div>
              <p className="text-[11px] text-molim-muted">منصة الفريق</p>
              <h1 className="text-lg font-black text-molim-foreground">مُلم</h1>
            </div>
          </div>

          <span className="text-xs text-molim-muted">
            الخطوة {step} من 2
          </span>
        </header>

        <div className="mt-5 flex gap-2">
          {[1, 2].map((item) => (
            <div
              key={item}
              className={`h-1 flex-1 ${
                item <= step ? "bg-[#ed542f]" : "bg-molim-soft"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <section className="mt-9">
            <p className="text-sm font-bold text-[#ed542f]">البيانات الأساسية</p>

            <h2 className="mt-2 text-3xl font-black leading-tight text-molim-foreground">
              أكمل بياناتك الشخصية
            </h2>

            <p className="mt-3 text-sm leading-6 text-molim-muted">
              عضويتك أُضيفت من قبل الإدارة. أكمل بياناتك ليتم اعتماد ملفك.
            </p>

            <div className="mt-8 space-y-4">
              <Input
                label="الاسم الأول"
                value={form.firstName}
                onChange={(value) => updateField("firstName", value)}
              />

              <Input
                label="اسم الأب"
                value={form.fatherName}
                onChange={(value) => updateField("fatherName", value)}
              />

              <Input
                label="اسم العائلة"
                value={form.lastName}
                onChange={(value) => updateField("lastName", value)}
              />

              <Input
                label="البريد الإلكتروني"
                type="email"
                value={form.email}
                onChange={(value) => updateField("email", value)}
              />

              <Input
                label="رقم الهاتف"
                type="tel"
                value={form.phone}
                onChange={(value) => updateField("phone", value)}
              />

              <Input
                label="تاريخ الميلاد"
                type="date"
                value={form.birthDate}
                onChange={(value) => updateField("birthDate", value)}
              />

              <Input
                label="الجنسية"
                value={form.nationality}
                onChange={(value) => updateField("nationality", value)}
              />

              <Input
                label="بلد الإقامة"
                value={form.residence}
                onChange={(value) => updateField("residence", value)}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!form.firstName.trim()) {
                  setError("الاسم الأول مطلوب.");
                  return;
                }
                setError("");
                setStep(2);
              }}
              className="mt-7 flex h-14 w-full items-center justify-center bg-[#ed542f] text-sm font-black text-white"
            >
              متابعة
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="mt-9">
            <p className="text-sm font-bold text-[#ed542f]">مهاراتك وأدواتك</p>

            <h2 className="mt-2 text-3xl font-black leading-tight text-molim-foreground">
              وش تقدر تقدم لمُلم؟
            </h2>

            <div className="mt-8">
              <p className="mb-3 text-sm font-black text-molim-foreground">
                المهارات
              </p>

              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => {
                  const selected = form.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleItem("skills", skill)}
                      className={`border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? "border-[#ed542f] bg-[#ed542f] text-white"
                          : "border-molim bg-molim-soft text-molim-foreground"
                      }`}
                    >
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8">
              <p className="mb-3 text-sm font-black text-molim-foreground">
                الأدوات والبرامج
              </p>

              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => {
                  const selected = form.tools.includes(tool);
                  return (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => toggleItem("tools", tool)}
                      className={`border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? "border-[#ed542f] bg-[#ed542f] text-white"
                          : "border-molim bg-molim-soft text-molim-foreground"
                      }`}
                    >
                      {tool}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="mt-5 bg-red-50 p-3 text-xs font-semibold text-red-600">
                {error}
              </p>
            )}

            <div className="mt-7 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-14 border border-molim bg-molim-soft text-sm font-black text-molim-foreground"
              >
                رجوع
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="h-14 bg-[#ed542f] text-sm font-black text-white disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? "جاري الحفظ..." : "حفظ بياناتي"}
              </button>
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-molim pt-6 text-center">
          <p className="text-[11px] text-molim-muted">
            مُلم — إكمال بيانات العضو
          </p>
        </footer>

        <Link
          href="/account"
          className="mt-5 block text-center text-xs font-bold text-molim-muted"
        >
          إكمال لاحقًا
        </Link>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-molim-foreground">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full border border-molim bg-molim-soft px-4 text-sm text-molim-foreground outline-none transition focus:border-[#ed542f]"
      />
    </label>
  );
}
