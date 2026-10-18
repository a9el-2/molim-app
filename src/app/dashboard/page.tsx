"use client";

import Link from "next/link";
import { useState } from "react";
import RoleGuard from "../components/RoleGuard";

type ActivityType =
  | "ساعات"
  | "مهام"
  | "شهادات"
  | "متطوعون"
  | "أقسام";

type Activity = {
  id: number;
  title: string;
  description: string;
  type: ActivityType;
  person: string;
  date: string;
};

type DepartmentPerformance = {
  name: string;
  members: number;
  tasks: number;
  completed: number;
  hours: number;
};

const activities: Activity[] = [
  {
    id: 1,
    title: "اعتماد ساعات تطوعية",
    description: "تم اعتماد 6 ساعات تطوعية لخالد علي.",
    type: "ساعات",
    person: "أصيل",
    date: "2026/09/03 — 08:42",
  },
  {
    id: 2,
    title: "مراجعة مهمة",
    description: "تم إرجاع مهمة سارة محمد للتعديل.",
    type: "مهام",
    person: "أصيل",
    date: "2026/09/03 — 08:20",
  },
  {
    id: 3,
    title: "إصدار شهادة",
    description: "تم إصدار شهادة مشاركة لمحمد علي.",
    type: "شهادات",
    person: "خالد علي",
    date: "2026/09/02 — 12:15",
  },
  {
    id: 4,
    title: "تحديث متطوع",
    description: "تم تحديث بيانات محمد أحمد.",
    type: "متطوعون",
    person: "خالد علي",
    date: "2026/09/02 — 15:30",
  },
];

const departments: DepartmentPerformance[] = [
  {
    name: "الإدارة",
    members: 8,
    tasks: 14,
    completed: 11,
    hours: 98,
  },
  {
    name: "الموارد البشرية",
    members: 6,
    tasks: 11,
    completed: 9,
    hours: 76,
  },
  {
    name: "الإعلام",
    members: 10,
    tasks: 18,
    completed: 15,
    hours: 124,
  },
  {
    name: "البحث",
    members: 5,
    tasks: 12,
    completed: 8,
    hours: 92,
  },
];

export default function DashboardPage() {
  const [selectedActivity, setSelectedActivity] =
    useState<Activity | null>(null);

  const totalMembers = departments.reduce(
    (total, department) => total + department.members,
    0
  );

  const totalTasks = departments.reduce(
    (total, department) => total + department.tasks,
    0
  );

  const totalCompletedTasks = departments.reduce(
    (total, department) => total + department.completed,
    0
  );

  const totalHours = departments.reduce(
    (total, department) => total + department.hours,
    0
  );

  const pendingTasks = totalTasks - totalCompletedTasks;
  const pendingHours = 3;
  const certificateRequests = 2;
  const activeVolunteers = totalMembers - 1;

  const completionRate =
    totalTasks > 0
      ? Math.round((totalCompletedTasks / totalTasks) * 100)
      : 0;

  function activityStyle(type: ActivityType) {
    switch (type) {
      case "ساعات":
        return "border-yellow-200 bg-yellow-50 text-yellow-700";

      case "مهام":
        return "border-blue-200 bg-blue-50 text-blue-700";

      case "شهادات":
        return "border-green-200 bg-green-50 text-green-700";

      case "متطوعون":
        return "border-purple-200 bg-purple-50 text-purple-700";

      case "أقسام":
        return "border-orange-200 bg-orange-50 text-orange-700";

      default:
        return "border-molim bg-molim-soft text-molim-foreground";
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
      <main
        dir="rtl"
        className="min-h-screen bg-molim px-4 py-5 text-molim-foreground"
      >
        <div className="mx-auto max-w-6xl">
        {/* Breadcrumb */}
        <div className="mb-5 text-sm text-molim-muted">
          <Link
            href="/"
            className="transition hover:text-[#ed542f]"
          >
            الرئيسية
          </Link>

          <span className="mx-2">←</span>

          <span className="font-semibold text-molim-foreground">
            لوحة المتابعة
          </span>
        </div>

        {/* Header */}
        <section className="mb-6">
          <p className="text-sm text-molim-muted">
            الإدارة العليا
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            لوحة المتابعة
          </h1>

          <p className="mt-2 text-sm leading-6 text-molim-muted">
            نظرة عامة على أداء فريق مُلم والأقسام والمهام
            والساعات والطلبات.
          </p>
        </section>

        {/* Main Statistics */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            title="المتطوعون"
            value={activeVolunteers}
            icon="👥"
          />

          <StatCard
            title="المهام"
            value={totalTasks}
            icon="📋"
          />

          <StatCard
            title="المهام المكتملة"
            value={totalCompletedTasks}
            icon="✅"
          />

          <StatCard
            title="الساعات المعتمدة"
            value={totalHours}
            icon="⏱️"
          />
        </section>

        {/* Pending / Requests */}
        <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryCard
            title="مهام تحتاج مراجعة"
            value={pendingTasks}
            description="مهام لم تكتمل أو تحتاج إجراء."
            href="/tasks"
            icon="🔎"
          />

          <SummaryCard
            title="ساعات قيد المراجعة"
            value={pendingHours}
            description="سجلات ساعات تنتظر الاعتماد."
            href="/hours"
            icon="🕒"
          />

          <SummaryCard
            title="طلبات شهادات"
            value={certificateRequests}
            description="طلبات تحتاج متابعة من الموارد البشرية."
            href="/certificate-requests"
            icon="🎓"
          />
        </section>

        {/* Completion */}
        <section className="mt-5 border border-molim bg-molim-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold">
                نسبة إكمال المهام
              </h2>

              <p className="mt-1 text-xs text-molim-muted">
                نسبة المهام المكتملة من إجمالي المهام المسجلة.
              </p>
            </div>

            <div className="text-2xl font-bold">
              {completionRate}%
            </div>
          </div>

          <div className="mt-4 h-3 overflow-hidden bg-molim-soft">
            <div
              className="h-full bg-[#ed542f] transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>

          <div className="mt-3 flex justify-between text-xs text-molim-muted">
            <span>
              مكتملة: {totalCompletedTasks}
            </span>

            <span>
              الإجمالي: {totalTasks}
            </span>
          </div>
        </section>

        {/* Departments */}
        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">
                أداء الأقسام
              </h2>

              <p className="mt-1 text-sm text-molim-muted">
                مقارنة مختصرة لأداء الأقسام الحالية.
              </p>
            </div>

            <Link
              href="/departments"
              className="shrink-0 text-sm font-semibold text-[#ed542f] transition hover:opacity-70"
            >
              إدارة الأقسام ←
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {departments.map((department) => {
              const rate =
                department.tasks > 0
                  ? Math.round(
                      (department.completed /
                        department.tasks) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={department.name}
                  className="border border-molim bg-molim-surface p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold">
                        {department.name}
                      </h3>

                      <p className="mt-1 text-xs text-molim-muted">
                        {department.members} أعضاء
                      </p>
                    </div>

                    <div className="text-left">
                      <p className="text-xl font-bold">
                        {rate}%
                      </p>

                      <p className="text-xs text-molim-muted">
                        إنجاز المهام
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 h-2 bg-molim-soft">
                    <div
                      className="h-full bg-[#ed542f] transition-all"
                      style={{ width: `${rate}%` }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MiniStat
                      title="الأعضاء"
                      value={department.members}
                    />

                    <MiniStat
                      title="المهام"
                      value={department.tasks}
                    />

                    <MiniStat
                      title="الساعات"
                      value={department.hours}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="mt-5">
          <div className="mb-3">
            <h2 className="text-lg font-bold">
              إجراءات سريعة
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <QuickAction
              title="المتطوعون"
              href="/volunteers"
              icon="👥"
            />

            <QuickAction
              title="المهام"
              href="/tasks"
              icon="📋"
            />

            <QuickAction
              title="الساعات"
              href="/hours"
              icon="⏱️"
            />

            <QuickAction
              title="التقارير"
              href="/reports"
              icon="📊"
            />
          </div>
        </section>

        {/* Recent Activity */}
        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">
                آخر العمليات
              </h2>

              <p className="mt-1 text-sm text-molim-muted">
                أحدث الإجراءات المسجلة داخل المنصة.
              </p>
            </div>

            <Link
              href="/audit-log"
              className="shrink-0 text-sm font-semibold text-[#ed542f] transition hover:opacity-70"
            >
              سجل العمليات ←
            </Link>
          </div>

          <div className="space-y-3">
            {activities.map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => setSelectedActivity(activity)}
                className="block w-full cursor-pointer border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f] hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">
                        {activity.title}
                      </h3>

                      <span
                        className={`border px-2 py-1 text-xs font-medium ${activityStyle(
                          activity.type
                        )}`}
                      >
                        {activity.type}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-molim-muted">
                      {activity.description}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-molim-muted">
                      <span>
                        المنفذ: {activity.person}
                      </span>

                      <span>{activity.date}</span>
                    </div>
                  </div>

                  <span className="shrink-0 text-sm font-semibold text-[#ed542f]">
                    التفاصيل ←
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Activity Modal */}
      {selectedActivity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedActivity(null);
            }
          }}
        >
          <div className="w-full max-w-lg border border-molim bg-molim-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-molim-muted">
                  تفاصيل العملية
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {selectedActivity.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedActivity(null)}
                className="cursor-pointer bg-molim-soft px-3 py-2 transition hover:bg-molim-soft"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <InfoBox
                title="نوع العملية"
                value={selectedActivity.type}
              />

              <InfoBox
                title="منفذ العملية"
                value={selectedActivity.person}
              />

              <InfoBox
                title="التاريخ"
                value={selectedActivity.date}
              />

              <div className="border border-molim bg-molim-soft p-4">
                <p className="text-xs text-molim-muted">
                  التفاصيل
                </p>

                <p className="mt-2 text-sm leading-6 text-molim-foreground">
                  {selectedActivity.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedActivity(null)}
                className="h-12 w-full cursor-pointer border border-molim bg-molim-surface font-semibold transition hover:bg-molim-soft"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
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
    <div className="border border-molim bg-molim-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs leading-5 text-molim-muted">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold">
            {value}
          </p>
        </div>

        <div className="bg-molim-soft px-2.5 py-2">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  href,
  icon,
}: {
  title: string;
  value: number;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-molim bg-molim-surface p-5 transition hover:border-[#ed542f] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{title}</h3>

          <p className="mt-2 text-3xl font-bold">
            {value}
          </p>

          <p className="mt-2 text-xs leading-5 text-molim-muted">
            {description}
          </p>
        </div>

        <div className="bg-molim-soft px-3 py-2">
          {icon}
        </div>
      </div>
    </Link>
  );
}

function QuickAction({
  title,
  href,
  icon,
}: {
  title: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-molim bg-molim-surface p-4 transition hover:border-[#ed542f] hover:shadow-sm"
    >
      <div className="inline-block bg-molim-soft px-3 py-2">
        {icon}
      </div>

      <p className="mt-3 font-semibold">
        {title}
      </p>
    </Link>
  );
}

function MiniStat({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="border border-molim bg-molim-soft px-3 py-2">
      <p className="text-xs text-molim-muted">
        {title}
      </p>

      <p className="mt-1 font-bold">
        {value}
      </p>
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
    <div className="border border-molim p-4">
      <p className="text-xs text-molim-muted">
        {title}
      </p>

      <p className="mt-1 font-semibold">
        {value}
      </p>
    </div>
  );
}