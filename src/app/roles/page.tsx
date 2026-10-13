"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLE_NAMES, PERMISSIONS, type UserRole } from "../lib/roles";
import RoleGuard from "../components/RoleGuard";
import { useAuth } from "../lib/auth-context";
import { fetchUsers, statusToArabic, updateUserField } from "../lib/supabase/dto";

type MemberStatus = "نشط" | "غير نشط" | "موقوف" | "منتهي التطوع" | "بانتظار الاعتماد";

type RoleMember = {
  id: number;
  name: string;
  molimId: string;
  role: UserRole;
  department: string;
  status: MemberStatus;
  lastUpdated: string;
};

type FilterType = "الكل" | UserRole;

const initialMembers: RoleMember[] = [
  {
    id: 1,
    name: "أصيل",
    molimId: "MOL-00001",
    role: "SUPER_ADMIN",
    department: "الإدارة",
    status: "نشط",
    lastUpdated: "2026/09/03",
  },
  {
    id: 2,
    name: "خالد علي",
    molimId: "MOL-00008",
    role: "HR",
    department: "الموارد البشرية",
    status: "نشط",
    lastUpdated: "2026/09/02",
  },
  {
    id: 3,
    name: "أحمد خالد",
    molimId: "MOL-00010",
    role: "DEPARTMENT_HEAD",
    department: "الإعلام",
    status: "نشط",
    lastUpdated: "2026/08/31",
  },
  {
    id: 4,
    name: "محمد أحمد",
    molimId: "MOL-00012",
    role: "VOLUNTEER",
    department: "الإدارة",
    status: "نشط",
    lastUpdated: "2026/08/30",
  },
  {
    id: 5,
    name: "سارة محمد",
    molimId: "MOL-00015",
    role: "VOLUNTEER",
    department: "البحث",
    status: "نشط",
    lastUpdated: "2026/08/29",
  },
];

const roleFilters: FilterType[] = [
  "الكل",
  "SUPER_ADMIN",
  "ADMIN",
  "HR",
  "DEPARTMENT_HEAD",
  "VOLUNTEER",
];

export default function RolesPage() {
  const { user: sessionUser } = useAuth();

  const [members, setMembers] =
    useState<RoleMember[]>(initialMembers);

  const [activeFilter, setActiveFilter] =
    useState<FilterType>("الكل");

  const [search, setSearch] = useState("");

  const [selectedMember, setSelectedMember] =
    useState<RoleMember | null>(null);

  const [selectedRole, setSelectedRole] =
    useState<UserRole>("VOLUNTEER");

  const [escalationConfirmed, setEscalationConfirmed] =
    useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers().then((users) => {
      if (!users) return;

      setMembers(
        users.map((user, index) => ({
          id: index + 1,
          name: user.name,
          molimId: user.id,
          role: user.role as UserRole,
          department: user.department === "غير محدد" ? "غير محدد" : user.department,
          status: toMemberStatus(user.status),
          lastUpdated: formatLastUpdated(user.updatedAt ?? user.createdAt),
        }))
      );
    });
  }, []);

  const isSelf = Boolean(
    selectedMember &&
      selectedMember.molimId === sessionUser.id
  );

  const isRoleChanged = Boolean(
    selectedMember && selectedMember.role !== selectedRole
  );

  const memberIsSuperAdmin = Boolean(
    selectedMember &&
      selectedMember.role === "SUPER_ADMIN"
  );

  const involvesSuperAdmin =
    selectedRole === "SUPER_ADMIN" ||
    memberIsSuperAdmin;

  const needsSuperAdminVerification =
    isRoleChanged && involvesSuperAdmin;

  const canSave =
    !isSelf && !(needsSuperAdminVerification && !escalationConfirmed);

  const superAdminCount = members.filter(
    (member) => member.role === "SUPER_ADMIN"
  ).length;

  const adminCount = members.filter(
    (member) => member.role === "ADMIN"
  ).length;

  const hrCount = members.filter(
    (member) => member.role === "HR"
  ).length;

  const headsCount = members.filter(
    (member) => member.role === "DEPARTMENT_HEAD"
  ).length;

  const volunteerCount = members.filter(
    (member) => member.role === "VOLUNTEER"
  ).length;

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return members.filter((member) => {
      const matchesRole =
        activeFilter === "الكل" ||
        member.role === activeFilter;

      const matchesSearch =
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.molimId.toLowerCase().includes(query) ||
        member.department.toLowerCase().includes(query) ||
        ROLE_NAMES[member.role]
          .toLowerCase()
          .includes(query);

      return matchesRole && matchesSearch;
    });
  }, [members, activeFilter, search]);

  function openMember(member: RoleMember) {
    setSelectedMember(member);
    setSelectedRole(member.role);
    setEscalationConfirmed(false);
    setSaveError(null);
  }

  function closeMember() {
    setSelectedMember(null);
    setEscalationConfirmed(false);
    setSaveError(null);
  }

  async function saveRole() {
    if (!selectedMember || saving) return;

    if (isSelf) return;

    if (
      needsSuperAdminVerification &&
      !escalationConfirmed
    ) {
      return;
    }

    const targetId = selectedMember.molimId;
    const newRole = selectedRole;

    setSaveError(null);
    setSaving(true);
    const result = await updateUserField(targetId, "role", newRole);
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error ?? "تعذر تحديث الرتبة.");
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === selectedMember.id
          ? {
              ...member,
              role: newRole,
              lastUpdated:
                new Date().toLocaleDateString("ar-SA"),
            }
          : member
      )
    );

    setSelectedMember((current) =>
      current
        ? {
            ...current,
            role: newRole,
            lastUpdated:
              new Date().toLocaleDateString("ar-SA"),
          }
        : null
    );

    setEscalationConfirmed(false);
  }

  function roleBadge(role: UserRole) {
    if (role === "SUPER_ADMIN") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (role === "ADMIN") {
      return "border-orange-200 bg-orange-50 text-orange-700";
    }

    if (role === "HR") {
      return "border-purple-200 bg-purple-50 text-purple-700";
    }

    if (role === "DEPARTMENT_HEAD") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    return "border-molim bg-molim-soft text-molim-foreground";
  }

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
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
            الصلاحيات والأدوار
          </span>
        </div>

        {/* Header */}
        <section className="mb-6">
          <h1 className="text-2xl font-bold">
            الصلاحيات والأدوار
          </h1>

          <p className="mt-2 text-sm leading-6 text-molim-muted">
            إدارة رتب أعضاء الفريق ومتابعة الصلاحيات
            المرتبطة بكل رتبة.
          </p>
        </section>

        {/* Statistics */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            title="الرئيس العام"
            value={superAdminCount}
            icon="👑"
          />

          <StatCard
            title="الإدارة العليا"
            value={adminCount}
            icon="🛡️"
          />

          <StatCard
            title="الموارد البشرية"
            value={hrCount}
            icon="👥"
          />

          <StatCard
            title="رؤساء الأقسام"
            value={headsCount}
            icon="🏢"
          />

          <StatCard
            title="المتطوعون"
            value={volunteerCount}
            icon="🙋"
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
            placeholder="ابحث باسم المستخدم، Molim ID أو القسم..."
            className="h-12 w-full border border-molim bg-molim-soft px-4 text-sm outline-none transition focus:border-[#ed542f]"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {roleFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`cursor-pointer border px-4 py-2.5 text-sm font-medium transition ${
                  activeFilter === filter
                    ? "border-[#ed542f] bg-[#ed542f] text-white"
                    : "border-molim bg-molim-surface text-molim-foreground hover:bg-molim-soft"
                }`}
              >
                {filter === "الكل"
                  ? "الكل"
                  : ROLE_NAMES[filter]}
              </button>
            ))}
          </div>
        </section>

        {/* Members */}
        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              أعضاء الفريق
            </h2>

            <span className="text-sm text-molim-muted">
              {filteredMembers.length} مستخدم
            </span>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="border border-dashed border-molim bg-molim-surface p-10 text-center">
              <p className="font-semibold">
                لا توجد نتائج
              </p>

              <p className="mt-2 text-sm text-molim-muted">
                لا توجد حسابات مطابقة للبحث أو الفلتر.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => openMember(member)}
                  className="block w-full cursor-pointer border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f] hover:shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">
                          {member.name}
                        </h3>

                        <span className="bg-molim-soft px-2 py-1 text-xs text-molim-muted">
                          {member.molimId}
                        </span>

                        <span
                          className={`border px-2 py-1 text-xs font-medium ${roleBadge(
                            member.role
                          )}`}
                        >
                          {ROLE_NAMES[member.role]}
                        </span>

                        <span className="border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
                          {member.status}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-molim-muted">
                        <span>
                          القسم: {member.department}
                        </span>

                        <span>
                          آخر تعديل: {member.lastUpdated}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-semibold text-[#ed542f]">
                      عرض الصلاحيات ←
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Member Permissions Modal */}
      {selectedMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMember();
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-molim bg-molim-surface p-5 shadow-2xl">

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-molim-muted">
                  تفاصيل الصلاحيات
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {selectedMember.name}
                </h2>

                <p className="mt-1 text-xs text-molim-muted">
                  {selectedMember.molimId}
                </p>
              </div>

              <button
                type="button"
                onClick={closeMember}
                className="cursor-pointer bg-molim-soft px-3 py-2 hover:bg-molim-soft"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">

              {/* Current Role */}
              <div className="grid grid-cols-2 gap-3">
                <InfoBox
                  title="القسم"
                  value={selectedMember.department}
                />

                <InfoBox
                  title="الحالة"
                  value={selectedMember.status}
                />
              </div>

              {/* Role */}
              <div className="border border-molim bg-molim-soft p-4">
                <label
                  htmlFor="userRole"
                  className="mb-2 block text-sm font-semibold"
                >
                  الرتبة
                </label>

                <select
                  id="userRole"
                  value={selectedRole}
                  onChange={(event) => {
                    setSelectedRole(
                      event.target.value as UserRole
                    );
                    setEscalationConfirmed(false);
                  }}
                  disabled={isSelf}
                  className="h-12 w-full border border-molim bg-molim-surface px-4 outline-none focus:border-[#ed542f] disabled:cursor-not-allowed disabled:bg-molim-soft disabled:text-molim-muted"
                >
                  <option value="VOLUNTEER">
                    متطوع
                  </option>

                  <option value="DEPARTMENT_HEAD">
                    رئيس قسم
                  </option>

                  <option value="HR">
                    الموارد البشرية
                  </option>

                  <option value="ADMIN">
                    الإدارة العليا
                  </option>

                  <option value="SUPER_ADMIN">
                    الرئيس العام
                  </option>
                </select>

                {isSelf ? (
                  <p className="mt-2 text-xs leading-5 text-red-600">
                    لا يمكنك تغيير رتبة حسابك الحالي عبر هذه
                    الصفحة.
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-molim-muted">
                    في النظام الحقيقي يجب منع المستخدم من تغيير
                    الرتبة دون امتلاك صلاحية إدارة الأدوار.
                  </p>
                )}
              </div>

              {/* Permissions */}
              <div className="border border-molim bg-molim-surface p-4">
                <p className="text-sm font-semibold">
                  الصلاحيات المرتبطة بهذه الرتبة
                </p>

                <div className="mt-3 space-y-2">
                  {PERMISSIONS[selectedRole].map(
                    (permission) => (
                      <div
                        key={permission}
                        className="border border-molim bg-molim-soft px-3 py-2 text-sm"
                      >
                        {permission}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Save */}
              {needsSuperAdminVerification &&
                !isSelf && (
                  <label className="flex cursor-pointer items-start gap-2 border border-orange-200 bg-orange-50 p-3 text-xs leading-5 text-orange-800">
                    <input
                      type="checkbox"
                      checked={escalationConfirmed}
                      onChange={(event) =>
                        setEscalationConfirmed(
                          event.target.checked
                        )
                      }
                      className="mt-0.5 cursor-pointer accent-[#ed542f]"
                    />

                    <span>
                      أؤكد أن منح أو سحب رتبة «الرئيس العام»
                      مرّ بإجراء تحقق داخلي وموافقة من الجهة
                      المخولة.
                    </span>
                  </label>
                )}

              {saveError && (
                <p className="mb-3 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {saveError}
                </p>
              )}

              <button
                type="button"
                onClick={saveRole}
                disabled={!canSave || saving}
                className={`h-12 w-full font-semibold transition ${
                  canSave && !saving
                    ? "cursor-pointer bg-[#ed542f] text-white hover:bg-[#d94725]"
                    : "cursor-not-allowed bg-molim-soft text-molim-muted"
                }`}
              >
                {saving ? "جارٍ الحفظ..." : "حفظ تغيير الرتبة"}
              </button>

              <button
                type="button"
                onClick={closeMember}
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

function toMemberStatus(
  status: string
): MemberStatus {
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

function formatLastUpdated(
  value: string | null | undefined
): string {
  if (!value) return "—";

  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  if (Number.isNaN(day)) return "—";

  return `${year}/${month}/${day}`;
}