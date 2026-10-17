"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import Card from "../components/Card";
import Button from "../components/Button";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../lib/auth-context";
import { ROLE_NAMES } from "../lib/roles";
import { fetchUser, statusToArabic, formatJoinDate } from "../lib/supabase/dto";
import type { UserDTO } from "../lib/supabase/dto";
import type { UserRole } from "../lib/roles";

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
];

const tools = [
  "Canva",
  "Photoshop",
  "Premiere Pro",
  "DaVinci Resolve",
  "CapCut",
  "Audacity",
  "Figma",
  "Microsoft Word",
  "Microsoft Excel",
  "PowerPoint",
  "Notion",
  "Telegram",
  "ChatGPT",
];

export default function AccountPage() {
  const { user: currentUser } = useAuth();

  const [dbUser, setDbUser] = useState<UserDTO | null>(null);
  const [showTelegram, setShowTelegram] = useState(false);

  useEffect(() => {
    fetchUser(currentUser.id).then((fetched) => {
      if (fetched) {
        setDbUser(fetched);
      }
    });
  }, [currentUser.id]);

  const roleName =
    dbUser && dbUser.role in ROLE_NAMES
      ? ROLE_NAMES[dbUser.role as UserRole]
      : ROLE_NAMES[currentUser.role];

  const displayName = dbUser ? dbUser.name : currentUser.name;
  const displayDepartment = dbUser
    ? dbUser.department === "غير محدد"
      ? currentUser.department
      : dbUser.department
    : currentUser.department;

  return (
    <PageShell>
      {/* العنوان */}
      <section className="mb-6">
        <h1 className="text-3xl font-black">
          حسابي
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-7 text-molim-muted">
          بيانات حسابك وعضويتك داخل الفريق.
        </p>
      </section>

      {/* معلومات الحساب الأساسية */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-molim-orange text-2xl font-black text-white">
            {displayName.charAt(0)}
          </div>

          <div>
            <h2 className="text-xl font-black">
              {displayName}
            </h2>

            <p className="mt-1 text-sm text-molim-muted">
              {roleName}
            </p>

            <p className="mt-1 text-xs text-molim-muted">
              {displayDepartment}
            </p>
          </div>
        </div>

        {/* معلومات العضوية */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoBox
            label="الحالة"
            value={dbUser ? statusToArabic(dbUser.status) : "نشط"}
            valueClass={
              dbUser && dbUser.status === "active"
                ? "text-green-600"
                : ""
            }
          />

          <InfoBox
            label="تاريخ الانضمام"
            value={dbUser ? formatJoinDate(dbUser.joinedAt ?? dbUser.createdAt) : "02 سبتمبر 2026"}
          />

          <InfoBox
            label="الاتفاقية"
            value="سارية"
            valueClass="text-green-600"
          />

          <InfoBox
            label="تاريخ الانتهاء"
            value="02 ديسمبر 2026"
          />
        </div>

        {/* عرض الاتفاقية */}
        <Link
          href="/agreement"
          className="mt-4 block"
        >
          <Button
            variant="secondary"
            className="w-full"
          >
            عرض الاتفاقية
          </Button>
        </Link>
      </Card>

      {/* البيانات الشخصية */}
      <SectionTitle
        title="البيانات الشخصية"
        description="المعلومات الأساسية المسجلة في حسابك."
      />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <InfoBox
          label="الاسم"
          value={displayName}
        />

        <InfoBox
          label="البريد الإلكتروني"
          value={dbUser?.email || "example@email.com"}
        />

        <InfoBox
          label="رقم الهاتف"
          value={dbUser?.phone || "+966 5xxxxxxxx"}
        />

        <InfoBox
          label="تاريخ الميلاد"
          value="غير معروض"
        />

        <InfoBox
          label="الجنسية"
          value="اليمن"
        />

        <InfoBox
          label="بلد الإقامة"
          value="السعودية"
        />
      </div>

      {/* حساب Telegram */}
      <SectionTitle
        title="حساب Telegram"
        description="الحساب المرتبط بعضويتك في مُلم."
      />

      <Card className="mt-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-molim-muted">
              اسم المستخدم
            </p>

            <p className="mt-1 text-sm font-black">
              {showTelegram
                ? "@Molim_Aseel"
                : "••••••••••"}
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() =>
              setShowTelegram(
                (current) => !current
              )
            }
            className="min-h-[40px] px-4 text-xs"
          >
            {showTelegram
              ? "إخفاء"
              : "إظهار"}
          </Button>
        </div>

        <p className="mt-4 border-t border-molim pt-4 text-[11px] leading-5 text-molim-muted">
          اسم المستخدم مأخوذ من حساب Telegram المرتبط
          ولا يمكن تعديله يدويًا من هذه الصفحة.
        </p>
      </Card>

      {/* بيانات العضوية */}
      <SectionTitle
        title="بيانات العضوية"
        description="المعلومات الإدارية المرتبطة بعضويتك."
      />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <InfoBox
          label="الرتبة"
          value={roleName}
        />

        <InfoBox
          label="القسم"
          value={displayDepartment}
        />

        <InfoBox
          label="الساعات المعتمدة"
          value="42 ساعة"
        />
      </div>

      {/* السيرة الذاتية */}
      <SectionTitle
        title="السيرة الذاتية"
        description="الملف المرفوع في حسابك."
      />

      <Card className="mt-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black">
              السيرة الذاتية
            </p>

            <p className="mt-1 text-xs text-molim-muted">
              CV_Aseel.pdf
            </p>
          </div>

          <button
            type="button"
            className="text-xs font-bold text-molim-blue"
          >
            عرض
          </button>
        </div>

        <button
          type="button"
          className="molim-button-outline mt-4 w-full"
        >
          تحديث السيرة الذاتية
        </button>
      </Card>

      {/* المهارات */}
      <SectionTitle
        title="مهاراتي"
        description="المهارات التي أضفتها عند التسجيل."
      />

      <Card className="mt-3 p-5">
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="border border-molim bg-molim-soft px-3 py-2 text-xs font-semibold"
            >
              {skill}
            </span>
          ))}
        </div>
      </Card>

      {/* الأدوات والبرامج */}
      <SectionTitle
        title="الأدوات والبرامج"
        description="البرامج والأدوات التي تجيد استخدامها."
      />

      <Card className="mt-3 p-5">
        <div className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <span
              key={tool}
              className="border border-molim bg-molim-soft px-3 py-2 text-xs font-semibold"
            >
              {tool}
            </span>
          ))}
        </div>
      </Card>

      {/* ملخص الإنجاز */}
      <SectionTitle
        title="ملخص الإنجاز"
        description="نظرة سريعة على نشاطك في فريق مُلم."
      />

      <div className="mt-3 grid grid-cols-3 gap-3">
        <StatBox
          title="الساعات"
          value="42"
        />

        <StatBox
          title="المهام"
          value="8"
        />

        <StatBox
          title="الشهادات"
          value="1"
        />
      </div>

      {/* الخصوصية */}
      <Card
        soft
        className="mt-6 border-r-4 border-r-molim-orange p-5"
      >
        <p className="text-sm font-bold">
          بياناتك الخاصة
        </p>

        <p className="mt-2 text-xs leading-6 text-molim-muted">
          بعض المعلومات في حسابك خاصة بك ولا يتم عرضها
          لأعضاء الفريق الآخرين.
        </p>
      </Card>

      {/* العودة */}
      <div className="mt-6">
        <Link href="/">
          <Button
            variant="primary"
            className="w-full"
          >
            العودة إلى الرئيسية
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-black">
        {title}
      </h2>

      <p className="mt-1 text-xs leading-5 text-molim-muted">
        {description}
      </p>
    </section>
  );
}

function InfoBox({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="molim-card p-4">
      <p className="text-[11px] text-molim-muted">
        {label}
      </p>

      <p
        className={`mt-1 break-words text-sm font-bold ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatBox({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-molim-muted">
        {title}
      </p>

      <p className="mt-2 text-2xl font-black">
        {value}
      </p>
    </Card>
  );
}