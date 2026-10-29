"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import Card from "../components/Card";
import Button from "../components/Button";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../lib/auth-context";
import { ROLE_NAMES } from "../lib/roles";
import {
  fetchUser,
  fetchMyHours,
  fetchMyAgreement,
  statusToArabic,
  formatJoinDate,
  formatBirthDate,
} from "../lib/supabase/dto";
import type { UserDTO, VolunteerAgreementDTO } from "../lib/supabase/dto";
import type { UserRole } from "../lib/roles";

export default function AccountPage() {
  const { user: currentUser, telegram } = useAuth();

  const [dbUser, setDbUser] = useState<UserDTO | null>(null);
  const [agreement, setAgreement] = useState<VolunteerAgreementDTO | null>(null);
  const [showTelegram, setShowTelegram] = useState(false);
  const [totalApprovedHours, setTotalApprovedHours] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);

  useEffect(() => {
    if (currentUser.id) {
      fetchUser(currentUser.id).then((fetched) => {
        if (fetched) {
          setDbUser(fetched);
          if (fetched.agreement) {
            setAgreement((prev) => prev ?? fetched.agreement ?? null);
          }
        }
      });
    }

    fetchMyAgreement()
      .then((res) => {
        if (res && res.ok && res.agreement) {
          setAgreement(res.agreement);
        }
      })
      .catch(() => {});

    fetchMyHours()
      .then((res) => {
        if (res && res.hours) {
          const total = res.hours
            .filter((h) => h.status === "approved")
            .reduce(
              (sum, h) =>
                sum +
                (Number(h.approved_hours ?? h.submitted_hours) || 0),
              0
            );
          setTotalApprovedHours(total);
        }
      })
      .catch(() => {});

    const initData =
      typeof window !== "undefined"
        ? window.Telegram?.WebApp?.initData
        : "";
    fetch("/api/tasks", {
      headers: initData ? { "X-Telegram-Init-Data": initData } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tasks && Array.isArray(data.tasks)) {
          setTasksCount(data.tasks.length);
        }
      })
      .catch(() => {});
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

  const userSkills = Array.isArray(dbUser?.skills) ? dbUser.skills : [];
  const userTools = Array.isArray(dbUser?.tools) ? dbUser.tools : [];

  const activeAgreement = agreement ?? dbUser?.agreement ?? null;
  const isAgreementActive =
    activeAgreement &&
    activeAgreement.status === "active" &&
    new Date(activeAgreement.expires_at).getTime() > Date.now();

  const agreementStatusLabel = activeAgreement
    ? isAgreementActive
      ? "سارية"
      : "منتهية"
    : "غير مسجلة";

  const agreementStatusClass = activeAgreement
    ? isAgreementActive
      ? "text-green-600"
      : "text-amber-600"
    : "text-molim-muted";

  const agreementExpiryDate = activeAgreement?.expires_at
    ? formatJoinDate(activeAgreement.expires_at)
    : "—";

  const displayBirthDate = dbUser?.birthDate
    ? formatBirthDate(dbUser.birthDate)
    : currentUser.birthDate
    ? formatBirthDate(currentUser.birthDate)
    : "غير مسجل";

  const displayNationality =
    dbUser?.nationality || currentUser.nationality || "—";

  const displayResidence =
    dbUser?.residence || currentUser.residence || "—";

  const displayPhone =
    dbUser?.phone || currentUser.phone || "غير مسجل";

  const displayEmail =
    dbUser?.email || currentUser.email || "غير مسجل";

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
            value={
              dbUser?.joinedAt ?? dbUser?.createdAt
                ? formatJoinDate(dbUser.joinedAt ?? dbUser.createdAt)
                : "—"
            }
          />

          <InfoBox
            label="الاتفاقية"
            value={agreementStatusLabel}
            valueClass={agreementStatusClass}
          />

          <InfoBox
            label="تاريخ الانتهاء"
            value={agreementExpiryDate}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-molim pt-3">
          <p className="text-xs text-molim-muted">
            {isAgreementActive
              ? "اتفاقية التطوع معتمدة وسارية."
              : activeAgreement
              ? "انتهت صلاحية اتفاقية التطوع، يرجى تجديدها."
              : "لم يتم تسجيل اتفاقية تطوع بعد."}
          </p>

          <Link
            href="/agreement"
            className="inline-flex items-center gap-1 text-xs font-black text-molim-orange hover:underline"
          >
            {isAgreementActive ? "عرض الاتفاقية ←" : "توقيع / تجديد الاتفاقية ←"}
          </Link>
        </div>


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
          value={displayEmail}
        />

        <InfoBox
          label="رقم الهاتف"
          value={displayPhone}
        />

        <InfoBox
          label="تاريخ الميلاد"
          value={displayBirthDate}
        />

        <InfoBox
          label="الجنسية"
          value={displayNationality}
        />

        <InfoBox
          label="بلد الإقامة"
          value={displayResidence}
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
                ? telegram?.user?.username
                  ? `@${telegram.user.username}`
                  : displayName
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
          value={`${totalApprovedHours} ساعة`}
        />
      </div>

      {/* المهارات */}
      <SectionTitle
        title="مهاراتي"
        description="المهارات المسجلة في حسابك."
      />

      <Card className="mt-3 p-5">
        {userSkills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {userSkills.map((skill) => (
              <span
                key={skill}
                className="border border-molim bg-molim-soft px-3 py-2 text-xs font-semibold"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-molim-muted">
            لم يتم تحديد مهارات بعد.
          </p>
        )}
      </Card>

      {/* الأدوات والبرامج */}
      <SectionTitle
        title="الأدوات والبرامج"
        description="البرامج والأدوات المسجلة في حسابك."
      />

      <Card className="mt-3 p-5">
        {userTools.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {userTools.map((tool) => (
              <span
                key={tool}
                className="border border-molim bg-molim-soft px-3 py-2 text-xs font-semibold"
              >
                {tool}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-molim-muted">
            لم يتم تحديد أدوات بعد.
          </p>
        )}
      </Card>

      {/* ملخص الإنجاز */}
      <SectionTitle
        title="ملخص الإنجاز"
        description="نظرة سريعة على نشاطك في فريق مُلم."
      />

      <div className="mt-3 grid grid-cols-3 gap-3">
        <StatBox
          title="الساعات"
          value={String(totalApprovedHours)}
        />

        <StatBox
          title="المهام"
          value={String(tasksCount)}
        />

        <StatBox
          title="الشهادات"
          value="0"
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