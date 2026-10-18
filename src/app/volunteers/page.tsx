"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RoleGuard from "../components/RoleGuard";
import { fetchUsers, statusToArabic, formatJoinDate, updateUserField } from "../lib/supabase/dto";
import { ROLE_NAMES } from "../lib/roles";
import type { UserRole } from "../lib/roles";

type VolunteerStatus = "نشط" | "بانتظار الاعتماد" | "موقوف" | "غير نشط" | "منتهي التطوع";

type Volunteer = {
  id: number;
  name: string;
  molimId: string;
  department: string;
  role: string;
  status: VolunteerStatus;
  hours: number;
  agreement: string;
  joinedAt: string;
};

export default function VolunteersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [selectedVolunteer, setSelectedVolunteer] =
    useState<Volunteer | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers().then((users) => {
      if (users) {
        setVolunteers(
          users.map((user, index) => ({
            id: index + 1,
            name: user.name,
            molimId: user.id,
            department:
              user.department === "غير محدد"
                ? "غير محدد"
                : user.department,
            role: roleLabel(user.role),
            status: toVolunteerStatus(user.status),
            hours: 0,
            agreement: agreementLabel(user.status),
            joinedAt: formatJoinDate(
              user.joinedAt ?? user.createdAt
            ),
          }))
        );
      }
      setIsLoading(false);
    });
  }, []);

  const filteredVolunteers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return volunteers.filter((volunteer) => {
      const matchesSearch =
        query === "" ||
        volunteer.name.toLowerCase().includes(query) ||
        volunteer.molimId.toLowerCase().includes(query) ||
        volunteer.department.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "الكل" ||
        volunteer.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, volunteers]);

  const activeCount = volunteers.filter(
    (volunteer) => volunteer.status === "نشط"
  ).length;

  const pendingCount = volunteers.filter(
    (volunteer) => volunteer.status === "بانتظار الاعتماد"
  ).length;

  const totalHours = volunteers.reduce(
    (total, volunteer) => total + volunteer.hours,
    0
  );

  function updateVolunteerStatus(
    id: number,
    status: VolunteerStatus
  ) {
    setVolunteers((current) =>
      current.map((volunteer) =>
        volunteer.id === id
          ? { ...volunteer, status }
          : volunteer
      )
    );
  }

  async function handleStatusChange(
    volunteer: Volunteer,
    status: VolunteerStatus
  ) {
    if (saving) return;

    setStatusError(null);
    setSaving(true);
    const result = await updateUserField(
      volunteer.molimId,
      "status",
      statusToDbStatus(status)
    );
    setSaving(false);

    if (!result.ok) {
      setStatusError(result.error ?? "تعذر تحديث حالة المتطوع.");
      return;
    }

    updateVolunteerStatus(volunteer.id, status);
    setSelectedVolunteer({ ...volunteer, status });
  }

  return (
    <RoleGuard allowedRoles={["HR", "ADMIN", "SUPER_ADMIN"]}>
      <main
        dir="rtl"
        className="relative min-h-screen overflow-hidden bg-molim-soft text-molim-foreground"
      >
      {/* الخلفية الهندسية */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-16 top-16 h-48 w-48 rotate-12 border-2 border-[#ed542f]/10" />

        <div className="absolute left-[-30px] top-72 h-32 w-32 -rotate-12 border border-[#202124]/10" />

        <div
          className="absolute left-8 top-36 h-24 w-24 border border-[#ed542f]/10"
          style={{
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          }}
        />

        <div className="absolute right-0 bottom-24 h-px w-52 rotate-[20deg] bg-[#ed542f]/10" />

        <div className="absolute bottom-10 left-14 h-20 w-20 rotate-45 border border-[#202124]/10" />
      </div>

      <div className="relative mx-auto max-w-md px-5 pb-14 pt-7">
        {/* الهيدر */}
        <header className="flex items-center justify-between border-b border-[#202124]/10 pb-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center bg-[#ed542f] text-xl font-black text-white">
              م
            </div>

            <div>
              <p className="text-[11px] text-molim-muted">
                منصة الإدارة
              </p>

              <h1 className="text-lg font-black text-molim-foreground">
                مُلم
              </h1>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center border border-molim bg-molim-soft text-lg text-molim-muted"
              aria-label="العودة"
            >
              ←
            </Link>
          </div>
        </header>

        {/* العنوان */}
        <section className="mt-9">
          <p className="text-sm font-bold text-[#ed542f]">
            الموارد البشرية
          </p>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-molim-foreground">
                المتطوعون
              </h2>

              <p className="mt-3 text-sm leading-7 text-molim-muted">
                إدارة ومتابعة أعضاء فريق مُلم وبيانات عضويتهم من
                مكان واحد.
              </p>
            </div>

            <Link
              href="/invitations"
              className="shrink-0 bg-[#ed542f] px-4 py-3 text-xs font-black text-white transition hover:bg-[#d94725]"
            >
              + إضافة متطوع
            </Link>
          </div>
        </section>

        {/* الإحصائيات */}
        <section className="mt-7 grid grid-cols-3 gap-px border border-molim bg-molim-soft">
          <Stat
            label="الإجمالي"
            value={String(volunteers.length)}
          />

          <Stat
            label="نشط"
            value={String(activeCount)}
          />

          <Stat
            label="بانتظار الاعتماد"
            value={String(pendingCount)}
          />
        </section>

        <section className="mt-2 grid grid-cols-2 gap-px border border-molim bg-molim-soft">
          <div className="bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              إجمالي الساعات
            </p>

            <p className="mt-2 text-2xl font-black text-molim-foreground">
              {totalHours}
            </p>
          </div>

          <div className="bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              الأقسام
            </p>

            <p className="mt-2 text-2xl font-black text-molim-foreground">
              {new Set(
                volunteers.map((volunteer) => volunteer.department)
              ).size}
            </p>
          </div>
        </section>

        {/* البحث */}
        <section className="mt-7">
          <p className="mb-2 text-xs font-bold text-molim-muted">
            البحث
          </p>

          <div className="relative">
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-molim-muted">
              🔍
            </span>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو Molim ID أو القسم..."
              className="h-14 w-full border border-molim bg-molim-soft px-11 text-sm outline-none placeholder:text-molim-muted focus:border-[#ed542f]"
            />
          </div>
        </section>

        {/* الفلاتر */}
        <section className="mt-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["الكل", "نشط", "بانتظار الاعتماد", "موقوف"].map(
              (filter) => {
                const selected = statusFilter === filter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={`shrink-0 border px-4 py-2 text-xs font-bold transition ${
                      selected
                        ? "border-[#ed542f] bg-[#ed542f] text-white"
                        : "border-molim bg-molim-soft text-molim-muted"
                    }`}
                  >
                    {filter}
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* القائمة */}
        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h3 className="text-lg font-black text-molim-foreground">
                قائمة المتطوعين
              </h3>

              <p className="mt-1 text-xs text-molim-muted">
                {filteredVolunteers.length} نتيجة
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="border border-molim bg-molim-soft p-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#ed542f] border-t-transparent" />
              <p className="mt-3 text-sm font-bold text-molim-muted">
                جاري تحميل بيانات المتطوعين...
              </p>
            </div>
          ) : filteredVolunteers.length > 0 ? (
            <div className="space-y-2">
              {filteredVolunteers.map((volunteer) => (
                <button
                  key={volunteer.id}
                  type="button"
                  onClick={() => {
                    setSelectedVolunteer(volunteer);
                    setStatusError(null);
                  }}
                  className="flex w-full items-start gap-3 border border-molim bg-molim-soft p-4 text-right transition hover:border-[#ed542f]"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#ed542f]/10 text-sm font-black text-[#ed542f]">
                    {getInitials(volunteer.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-molim-foreground">
                          {volunteer.name}
                        </p>

                        <p className="mt-1 text-[10px] font-bold text-[#ed542f]">
                          {volunteer.molimId}
                        </p>
                      </div>

                      <StatusBadge
                        status={volunteer.status}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <SmallInfo
                        label="القسم"
                        value={volunteer.department}
                      />

                      <SmallInfo
                        label="الرتبة"
                        value={volunteer.role}
                      />

                      <SmallInfo
                        label="الساعات"
                        value={`${volunteer.hours} ساعة`}
                      />

                      <SmallInfo
                        label="الاتفاقية"
                        value={volunteer.agreement}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-molim bg-molim-soft p-8 text-center">
              <div className="text-3xl">🔎</div>

              <p className="mt-3 text-sm font-black text-molim-foreground">
                لا توجد نتائج
              </p>

              <p className="mt-1 text-xs text-molim-muted">
                جرّب تغيير كلمات البحث أو الفلتر.
              </p>
            </div>
          )}
        </section>

        {/* إجراءات */}
        <section className="mt-8 grid grid-cols-2 gap-2">
          <Link
            href="/invitations"
            className="border border-molim bg-molim-soft p-4 text-right transition hover:border-[#ed542f]"
          >
            <div className="flex h-9 w-9 items-center justify-center bg-[#ed542f]/10 text-[#ed542f]">
              +
            </div>

            <p className="mt-3 text-sm font-black text-molim-foreground">
              الدعوات
            </p>

            <p className="mt-1 text-[11px] leading-5 text-molim-muted">
              إدارة دعوات الأعضاء الجدد
            </p>
          </Link>

          <Link
            href="/roles"
            className="border border-molim bg-molim-soft p-4 text-right transition hover:border-[#ed542f]"
          >
            <div className="flex h-9 w-9 items-center justify-center bg-molim-soft text-molim-foreground">
              👥
            </div>

            <p className="mt-3 text-sm font-black text-molim-foreground">
              الأدوار والصلاحيات
            </p>

            <p className="mt-1 text-[11px] leading-5 text-molim-muted">
              إدارة رتب وأدوار الفريق
            </p>
          </Link>
        </section>

        {/* تنبيه الخصوصية */}
        <section className="mt-8 border-r-4 border-[#ed542f] bg-molim-soft px-5 py-4">
          <p className="text-xs font-black text-molim-foreground">
            🔐 بيانات المتطوعين
          </p>

          <p className="mt-1 text-xs leading-6 text-molim-muted">
            هذه الصفحة مخصصة للصلاحيات الإدارية. البيانات الشخصية
            وبيانات Telegram لا تُعرض إلا للجهات المخولة وفق
            صلاحيات النظام.
          </p>
        </section>

        {/* الفوتر */}
        <footer className="mt-10 border-t border-molim pt-6 text-center">
          <p className="text-[11px] text-molim-muted">
            مُلم — إدارة فريقك بشكل أبسط وآمن وسلس
          </p>
        </footer>
      </div>

      {/* نافذة تفاصيل المتطوع */}
      {selectedVolunteer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5">
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto border border-molim bg-molim-soft shadow-2xl">
            <div className="sticky top-0 border-b border-molim bg-molim-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-molim-muted">
                    ملف المتطوع
                  </p>

                  <h3 className="mt-1 text-xl font-black text-molim-foreground">
                    {selectedVolunteer.name}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedVolunteer(null);
                    setStatusError(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center border border-molim text-lg text-molim-muted"
                  aria-label="إغلاق"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-2">
                <InfoCard
                  label="Molim ID"
                  value={selectedVolunteer.molimId}
                />

                <InfoCard
                  label="الحالة"
                  value={selectedVolunteer.status}
                />

                <InfoCard
                  label="القسم"
                  value={selectedVolunteer.department}
                />

                <InfoCard
                  label="الرتبة"
                  value={selectedVolunteer.role}
                />

                <InfoCard
                  label="الساعات"
                  value={`${selectedVolunteer.hours} ساعة`}
                />

                <InfoCard
                  label="الاتفاقية"
                  value={selectedVolunteer.agreement}
                />

                <InfoCard
                  label="تاريخ الانضمام"
                  value={selectedVolunteer.joinedAt}
                />
              </div>

              {/* تحديث الحالة */}
              <div className="mt-5 border border-molim bg-molim-soft p-4">
                <p className="text-xs font-black text-molim-foreground">
                  تحديث حالة المتطوع
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      handleStatusChange(
                        selectedVolunteer,
                        "نشط"
                      )
                    }
                    className="h-12 border border-green-200 bg-green-50 text-xs font-black text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    تفعيل
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      handleStatusChange(
                        selectedVolunteer,
                        "موقوف"
                      )
                    }
                    className="h-12 border border-red-200 bg-red-50 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    إيقاف
                  </button>
                </div>

                {statusError && (
                  <p className="mt-3 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {statusError}
                  </p>
                )}
              </div>

              <div className="mt-5 space-y-2">
                <DetailAction
                  title="عرض البيانات الشخصية"
                  description="البيانات التي أدخلها المتطوع عند التسجيل"
                />

                <DetailAction
                  title="عرض المهارات والبرامج"
                  description="المهارات والأدوات التي يجيدها المتطوع"
                />

                <DetailAction
                  title="عرض المهام والساعات"
                  description="المهام المسجلة والساعات المعتمدة"
                />

                <DetailAction
                  title="عرض الاتفاقيات"
                  description="الاتفاقيات الحالية والسابقة"
                />

                <DetailAction
                  title="عرض الشهادات"
                  description="الشهادات والطلبات السابقة"
                />
              </div>

              <div className="mt-5 border border-[#ed542f]/20 bg-[#ed542f]/5 p-4">
                <p className="text-xs font-black text-molim-foreground">
                  🔒 بيانات Telegram
                </p>

                <p className="mt-1 text-[11px] leading-5 text-molim-muted">
                  بيانات Telegram الحساسة يتم التعامل معها من خلال
                  طبقة النظام الآمنة، ولا يتم عرض Telegram User ID
                  هنا.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedVolunteer(null);
                  setStatusError(null);
                }}
                className="mt-5 h-12 w-full bg-[#ed542f] text-sm font-black text-white"
              >
                إغلاق الملف
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </RoleGuard>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-molim-soft p-4">
      <p className="text-[10px] text-molim-muted">{label}</p>

      <p className="mt-2 text-2xl font-black text-molim-foreground">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: VolunteerStatus;
}) {
  const styles: Record<VolunteerStatus, string> = {
    نشط: "bg-green-50 text-green-700 border-green-200",
    "بانتظار الاعتماد":
      "bg-yellow-50 text-yellow-700 border-yellow-200",
    موقوف: "bg-red-50 text-red-700 border-red-200",
    "غير نشط": "bg-molim-soft text-molim-muted border-molim",
    "منتهي التطوع": "bg-molim-soft text-molim-muted border-molim",
  };

  return (
    <span
      className={`shrink-0 border px-2 py-1 text-[10px] font-bold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function roleLabel(role: string): string {
  if (role in ROLE_NAMES) {
    return ROLE_NAMES[role as UserRole];
  }
  return "متطوع";
}

function toVolunteerStatus(
  status: string
): VolunteerStatus {
  const label = statusToArabic(status);

  if (
    label === "نشط" ||
    label === "بانتظار الاعتماد" ||
    label === "موقوف"
  ) {
    return label;
  }

  if (label === "غير نشط") {
    return "غير نشط";
  }

  return "منتهي التطوع";
}

function agreementLabel(status: string): string {
  if (status === "pending") return "لم تبدأ";
  if (status === "active") return "سارية";
  return "منتهية";
}

function statusToDbStatus(
  status: VolunteerStatus
): string {
  if (status === "نشط") return "active";
  if (status === "موقوف") return "suspended";
  if (status === "بانتظار الاعتماد") return "pending";
  if (status === "غير نشط") return "inactive";
  return "ended";
}

function SmallInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#f3f1ec] p-2.5">
      <p className="text-[9px] text-molim-muted">{label}</p>

      <p className="mt-1 truncate text-[10px] font-bold text-molim-foreground">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border border-molim bg-molim-soft p-4">
      <p className="text-[10px] text-molim-muted">{label}</p>

      <p className="mt-1 break-words text-xs font-black text-molim-foreground">
        {value}
      </p>
    </div>
  );
}

function DetailAction({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between border border-molim bg-molim-soft p-4 text-right transition hover:border-[#ed542f]"
    >
      <div>
        <p className="text-sm font-black text-molim-foreground">
          {title}
        </p>

        <p className="mt-1 text-[11px] leading-5 text-molim-muted">
          {description}
        </p>
      </div>

      <span className="text-lg text-molim-muted">←</span>
    </button>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].charAt(0);
  }

  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}