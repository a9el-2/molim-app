"use client";

import { useEffect, useMemo, useState } from "react";
import RoleGuard from "../components/RoleGuard";
import { fetchUsers, statusToArabic, formatDateShort, updateUserField } from "../lib/supabase/dto";
import { ROLE_NAMES } from "../lib/roles";
import type { UserRole } from "../lib/roles";

type VolunteerStatus =
  | "نشط"
  | "غير نشط"
  | "موقوف"
  | "منتهي التطوع"
  | "بانتظار الاعتماد";

type HRVolunteer = {
  id: number;
  name: string;
  molimId: string;
  department: string;
  role: string;
  status: VolunteerStatus;
  hours: number;
  agreements: number;
  certificates: number;
  joinDate: string;
};

type FilterType =
  | "الكل"
  | VolunteerStatus;

const initialVolunteers: HRVolunteer[] = [
  {
    id: 1,
    name: "محمد أحمد",
    molimId: "MOL-00012",
    department: "الإدارة",
    role: "متطوع",
    status: "نشط",
    hours: 52,
    agreements: 1,
    certificates: 1,
    joinDate: "2026/06/01",
  },
  {
    id: 2,
    name: "خالد علي",
    molimId: "MOL-00008",
    department: "الموارد البشرية",
    role: "الموارد البشرية",
    status: "نشط",
    hours: 320,
    agreements: 2,
    certificates: 3,
    joinDate: "2026/03/15",
  },
  {
    id: 3,
    name: "أحمد خالد",
    molimId: "MOL-00010",
    department: "الإعلام",
    role: "رئيس قسم",
    status: "نشط",
    hours: 180,
    agreements: 2,
    certificates: 2,
    joinDate: "2026/02/10",
  },
  {
    id: 4,
    name: "سارة محمد",
    molimId: "MOL-00015",
    department: "البحث",
    role: "متطوع",
    status: "موقوف",
    hours: 185,
    agreements: 1,
    certificates: 0,
    joinDate: "2026/05/20",
  },
  {
    id: 5,
    name: "محمد علي",
    molimId: "MOL-00019",
    department: "الإعلام",
    role: "متطوع",
    status: "غير نشط",
    hours: 68,
    agreements: 1,
    certificates: 1,
    joinDate: "2026/04/12",
  },
];

const filters: FilterType[] = [
  "الكل",
  "نشط",
  "غير نشط",
  "موقوف",
  "منتهي التطوع",
  "بانتظار الاعتماد",
];

export default function HRPage() {
  const [volunteers, setVolunteers] =
    useState<HRVolunteer[]>(initialVolunteers);

  const [search, setSearch] = useState("");

  const [activeFilter, setActiveFilter] =
    useState<FilterType>("الكل");

  const [selectedVolunteer, setSelectedVolunteer] =
    useState<HRVolunteer | null>(null);

  const [selectedStatus, setSelectedStatus] =
    useState<VolunteerStatus>("نشط");

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers().then((users) => {
      if (!users) return;

      setVolunteers(
        users.map((user, index) => ({
          id: index + 1,
          name: user.name,
          molimId: user.id,
          department:
            user.department === "غير محدد"
              ? "غير محدد"
              : user.department,
          role: hrRoleLabel(user.role),
          status: toHRStatus(user.status),
          hours: 0,
          agreements: 0,
          certificates: 0,
          joinDate: formatDateShort(
            user.joinedAt ?? user.createdAt
          ),
        }))
      );
    });
  }, []);

  const activeCount = volunteers.filter(
    (volunteer) => volunteer.status === "نشط"
  ).length;

  const inactiveCount = volunteers.filter(
    (volunteer) => volunteer.status === "غير نشط"
  ).length;

  const suspendedCount = volunteers.filter(
    (volunteer) => volunteer.status === "موقوف"
  ).length;

  const endedCount = volunteers.filter(
    (volunteer) => volunteer.status === "منتهي التطوع"
  ).length;

  const filteredVolunteers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return volunteers.filter((volunteer) => {
      const matchesFilter =
        activeFilter === "الكل" ||
        volunteer.status === activeFilter;

      const matchesSearch =
        !query ||
        volunteer.name.toLowerCase().includes(query) ||
        volunteer.molimId.toLowerCase().includes(query) ||
        volunteer.department.toLowerCase().includes(query) ||
        volunteer.role.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [volunteers, search, activeFilter]);

  function openVolunteer(volunteer: HRVolunteer) {
    setSelectedVolunteer(volunteer);
    setSelectedStatus(volunteer.status);
    setSaveError(null);
  }

  function closeVolunteer() {
    setSelectedVolunteer(null);
    setSaveError(null);
  }

  async function saveStatus() {
    if (!selectedVolunteer || saving) return;

    const targetId = selectedVolunteer.molimId;
    const newStatus = selectedStatus;

    setSaveError(null);
    setSaving(true);
    const result = await updateUserField(
      targetId,
      "status",
      statusToDB(newStatus)
    );
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error ?? "تعذر تحديث حالة العضوية.");
      return;
    }

    setVolunteers((current) =>
      current.map((volunteer) =>
        volunteer.id === selectedVolunteer.id
          ? {
              ...volunteer,
              status: newStatus,
            }
          : volunteer
      )
    );

    setSelectedVolunteer((current) =>
      current
        ? {
            ...current,
            status: newStatus,
          }
        : null
    );
  }

  function statusStyle(status: VolunteerStatus) {
    switch (status) {
      case "نشط":
        return "border-green-200 bg-green-50 text-green-700";

      case "غير نشط":
        return "border-molim bg-molim-soft text-molim-muted";

      case "موقوف":
        return "border-red-200 bg-red-50 text-red-700";

      case "منتهي التطوع":
        return "border-molim bg-molim-soft text-molim-muted";

      case "بانتظار الاعتماد":
        return "border-yellow-200 bg-yellow-50 text-yellow-700";

      default:
        return "border-molim bg-molim-soft text-molim-foreground";
    }
  }

  return (
    <RoleGuard allowedRoles={["HR", "SUPER_ADMIN"]}>
      <main
        dir="rtl"
        className="min-h-screen bg-molim px-4 py-5 text-molim-foreground"
      >
      <div className="mx-auto max-w-5xl">

        {/* Breadcrumb */}
        <div className="mb-5 text-sm text-molim-muted">
          <span>الرئيسية</span>
          <span className="mx-2">←</span>
          <span>الإدارة</span>
          <span className="mx-2">←</span>
          <span className="font-semibold text-molim-foreground">
            إدارة الموارد البشرية
          </span>
        </div>

        {/* Header */}
        <section className="mb-6">
          <h1 className="text-2xl font-bold">
            إدارة الموارد البشرية
          </h1>

          <p className="mt-2 text-sm leading-6 text-molim-muted">
            متابعة المتطوعين وملفاتهم واتفاقياتهم وشهاداتهم
            وحالتهم داخل الفريق.
          </p>
        </section>

        {/* Statistics */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">

          <StatCard
            title="المتطوعون النشطون"
            value={activeCount}
            icon="🟢"
          />

          <StatCard
            title="غير نشط"
            value={inactiveCount}
            icon="⚪"
          />

          <StatCard
            title="موقوف"
            value={suspendedCount}
            icon="🔴"
          />

          <StatCard
            title="منتهي التطوع"
            value={endedCount}
            icon="⚫"
          />

          <StatCard
            title="إجمالي المتطوعين"
            value={volunteers.length}
            icon="👥"
          />

        </section>

        {/* Search + Filters */}
        <section className="mt-5 border border-molim bg-molim-surface p-4">

          <label className="mb-2 block text-sm font-semibold">
            البحث
          </label>

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="ابحث باسم المتطوع، Molim ID أو القسم..."
            className="h-12 w-full border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f]"
          />

          <div className="mt-4 flex flex-wrap gap-2">

            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() =>
                  setActiveFilter(filter)
                }
                className={`cursor-pointer border px-4 py-2.5 text-sm font-medium transition ${
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

        {/* Quick Actions */}
        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">

          <ActionCard
            title="المتطوعون"
            description="إدارة ملفات المتطوعين"
            href="/volunteers"
            icon="👥"
          />

          <ActionCard
            title="إضافة الأعضاء"
            description="إضافة الأعضاء وتزويدهم برمز الربط"
            href="/invitations"
            icon="🎟️"
          />

          <ActionCard
            title="الاتفاقيات"
            description="متابعة اتفاقيات التطوع"
            href="/agreements"
            icon="📄"
          />

          <ActionCard
            title="الشهادات"
            description="طلبات الشهادات والتوصيات"
            href="/certificate-requests"
            icon="🎓"
          />

        </section>

        {/* Volunteers */}
        <section className="mt-5">

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              ملفات المتطوعين
            </h2>

            <span className="text-sm text-molim-muted">
              {filteredVolunteers.length} متطوع
            </span>
          </div>

          {filteredVolunteers.length === 0 ? (

            <div className="border border-dashed border-molim bg-molim-surface p-10 text-center">

              <p className="font-semibold">
                لا توجد نتائج
              </p>

              <p className="mt-2 text-sm text-molim-muted">
                لا توجد ملفات تطابق البحث أو الحالة.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {filteredVolunteers.map((volunteer) => (

                <button
                  key={volunteer.id}
                  type="button"
                  onClick={() =>
                    openVolunteer(volunteer)
                  }
                  className="block w-full cursor-pointer border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f] hover:shadow-sm"
                >

                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                    <div>

                      <div className="flex flex-wrap items-center gap-2">

                        <h3 className="font-bold">
                          {volunteer.name}
                        </h3>

                        <span className="bg-molim-soft px-2 py-1 text-xs text-molim-muted">
                          {volunteer.molimId}
                        </span>

                        <span className="border border-molim bg-molim-soft px-2 py-1 text-xs text-molim-muted">
                          {volunteer.role}
                        </span>

                        <span
                          className={`border px-2 py-1 text-xs font-medium ${statusStyle(
                            volunteer.status
                          )}`}
                        >
                          {volunteer.status}
                        </span>

                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-molim-muted">

                        <span>
                          القسم: {volunteer.department}
                        </span>

                        <span>
                          الساعات: {volunteer.hours}
                        </span>

                        <span>
                          الاتفاقيات: {volunteer.agreements}
                        </span>

                        <span>
                          الشهادات: {volunteer.certificates}
                        </span>

                        <span>
                          الانضمام: {volunteer.joinDate}
                        </span>

                      </div>

                    </div>

                    <div className="shrink-0 text-sm font-semibold text-[#ed542f]">
                      عرض الملف ←
                    </div>

                  </div>

                </button>

              ))}

            </div>

          )}

        </section>
      </div>

      {/* Volunteer Details Modal */}
      {selectedVolunteer && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeVolunteer();
            }
          }}
        >

          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-molim bg-molim-surface p-5 shadow-2xl">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-sm text-molim-muted">
                  ملف المتطوع
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {selectedVolunteer.name}
                </h2>

                <p className="mt-1 text-xs text-molim-muted">
                  {selectedVolunteer.molimId}
                </p>

              </div>

              <button
                type="button"
                onClick={closeVolunteer}
                className="cursor-pointer bg-molim-soft px-3 py-2 hover:bg-molim-soft"
              >
                ✕
              </button>

            </div>

            <div className="mt-5 space-y-4">

              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-3">

                <InfoBox
                  title="القسم"
                  value={selectedVolunteer.department}
                />

                <InfoBox
                  title="الرتبة"
                  value={selectedVolunteer.role}
                />

                <InfoBox
                  title="الساعات"
                  value={`${selectedVolunteer.hours} ساعة`}
                />

                <InfoBox
                  title="تاريخ الانضمام"
                  value={selectedVolunteer.joinDate}
                />

                <InfoBox
                  title="الاتفاقيات"
                  value={String(
                    selectedVolunteer.agreements
                  )}
                />

                <InfoBox
                  title="الشهادات"
                  value={String(
                    selectedVolunteer.certificates
                  )}
                />

              </div>

              {/* Status */}
              <div className="border border-molim bg-molim-soft p-4">

                <label
                  htmlFor="volunteerStatus"
                  className="mb-2 block text-sm font-semibold"
                >
                  حالة العضوية
                </label>

                <select
                  id="volunteerStatus"
                  value={selectedStatus}
                  onChange={(event) =>
                    setSelectedStatus(
                      event.target.value as VolunteerStatus
                    )
                  }
                  className="h-12 w-full border border-molim bg-molim-surface px-4 outline-none focus:border-[#ed542f]"
                >
                  <option value="نشط">
                    🟢 نشط
                  </option>

                  <option value="غير نشط">
                    ⚪ غير نشط
                  </option>

                  <option value="موقوف">
                    🔴 موقوف
                  </option>

                  <option value="منتهي التطوع">
                    ⚫ منتهي التطوع
                  </option>

                  <option value="بانتظار الاعتماد">
                    🟡 بانتظار الاعتماد
                  </option>
                </select>

              </div>

              {/* Save */}
              {saveError && (
                <p className="mb-3 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {saveError}
                </p>
              )}

              <button
                type="button"
                onClick={saveStatus}
                disabled={saving}
                className="h-12 w-full cursor-pointer bg-[#ed542f] font-semibold text-white hover:bg-[#d94725] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "جارٍ الحفظ..." : "حفظ حالة العضوية"}
              </button>

              {/* Related Pages */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                <a
                  href="/agreements"
                  className="border border-molim bg-molim-surface p-4 text-right hover:border-[#ed542f]"
                >
                  <p className="font-semibold">
                    📄 الاتفاقيات
                  </p>

                  <p className="mt-1 text-xs text-molim-muted">
                    متابعة اتفاقيات هذا المتطوع
                  </p>
                </a>

                <a
                  href="/certificate-requests"
                  className="border border-molim bg-molim-surface p-4 text-right hover:border-[#ed542f]"
                >
                  <p className="font-semibold">
                    🎓 الشهادات والتوصيات
                  </p>

                  <p className="mt-1 text-xs text-molim-muted">
                    متابعة الطلبات والإصدار
                  </p>
                </a>

              </div>

              <button
                type="button"
                onClick={closeVolunteer}
                className="h-12 w-full cursor-pointer border border-molim bg-molim-surface font-semibold text-molim-foreground hover:bg-molim-soft"
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

function ActionCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      className="border border-molim bg-molim-surface p-4 transition hover:border-[#ed542f] hover:shadow-sm"
    >
      <div className="text-xl">
        {icon}
      </div>

      <p className="mt-3 font-semibold">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-molim-muted">
        {description}
      </p>
    </a>
  );
}

function hrRoleLabel(role: string): string {
  if (role in ROLE_NAMES) {
    return ROLE_NAMES[role as UserRole];
  }
  return "متطوع";
}

function toHRStatus(status: string): VolunteerStatus {
  const label = statusToArabic(status);

  if (
    label === "نشط" ||
    label === "غير نشط" ||
    label === "موقوف" ||
    label === "منتهي التطوع" ||
    label === "بانتظار الاعتماد"
  ) {
    return label;
  }

  return "غير نشط";
}

function statusToDB(status: VolunteerStatus): string {
  switch (status) {
    case "نشط":
      return "active";
    case "بانتظار الاعتماد":
      return "pending";
    case "موقوف":
      return "suspended";
    case "منتهي التطوع":
      return "ended";
    case "غير نشط":
      return "inactive";
    default:
      return status;
  }
}
