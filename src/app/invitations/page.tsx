"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RoleGuard from "../components/RoleGuard";
import { ROLE_NAMES } from "../lib/roles";
import type { UserRole } from "../lib/roles";
import {
  addMember,
  fetchDepartments,
  fetchUsers,
  statusToArabic,
} from "../lib/supabase/dto";
import type { DepartmentDTO, UserDTO } from "../lib/supabase/dto";

type RoleFilter = "الكل" | UserRole;

const roleFilters: RoleFilter[] = [
  "الكل",
  "VOLUNTEER",
  "DEPARTMENT_HEAD",
  "HR",
  "ADMIN",
  "SUPER_ADMIN",
];

export default function MembersPage() {
  const [members, setMembers] = useState<UserDTO[]>([]);
  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);
  const [activeFilter, setActiveFilter] = useState<RoleFilter>("الكل");
  const [search, setSearch] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [createdResult, setCreatedResult] = useState<{
    id: string;
    linkCode: string;
    expiresAt: string;
  } | null>(null);

  const [departmentId, setDepartmentId] = useState("");
  const [copiedMessage, setCopiedMessage] = useState(false);

  useEffect(() => {
    fetchUsers().then((users) => {
      if (users) setMembers(users);
    });
    fetchDepartments().then((list) => {
      if (list) setDepartments(list);
    });
  }, []);

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;
  const incompleteCount = members.filter(
    (m) => m.profileCompleted === false
  ).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return members.filter((member) => {
      const matchesFilter =
        activeFilter === roleFilters[0] || member.role === activeFilter;

      const displayName =
        member.profileCompleted === false
          ? "لم يكمل بياناته بعد"
          : member.name;

      const matchesSearch =
        !query ||
        displayName.toLowerCase().includes(query) ||
        member.name.toLowerCase().includes(query) ||
        member.id.toLowerCase().includes(query) ||
        member.department.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [members, activeFilter, search]);

  function resetForm() {
    setDepartmentId("");
    setCreateError("");
  }

  async function handleCreate() {
    if (creating) return;

    setCreating(true);
    setCreateError("");

    const result = await addMember({
      departmentId: departmentId || null,
    });

    setCreating(false);

    if (!result.member || !result.linkCode) {
      setCreateError(result.error || "تعذر إنشاء العضو.");
      return;
    }

    setCreatedResult({
      id: result.member.id,
      linkCode: result.linkCode,
      expiresAt: result.expiresAt ?? "",
    });
    setShowCreateForm(false);
    resetForm();

    fetchUsers().then((users) => {
      if (users) setMembers(users);
    });
  }

  function copyCode(code: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
  }

  return (
    <RoleGuard>
      <main
        dir="rtl"
        className="relative min-h-screen overflow-hidden bg-molim-soft px-4 py-5 text-molim-foreground"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-12 top-14 h-44 w-44 rotate-12 border-2 border-[#ed542f]/10" />
          <div className="absolute left-[-25px] top-72 h-32 w-32 -rotate-12 border border-[#202124]/10" />
        </div>

        <div className="relative mx-auto max-w-md px-1 pb-14 pt-3">
          <div className="mb-5 text-xs text-molim-muted">
            <Link href="/" className="hover:text-[#ed542f]">
              الرئيسية
            </Link>
            <span className="mx-2">←</span>
            <Link href="/volunteers" className="hover:text-[#ed542f]">
              المتطوعون
            </Link>
            <span className="mx-2">←</span>
            <span className="font-bold text-molim-foreground">
              إضافة الأعضاء
            </span>
          </div>

          <section className="flex items-end justify-between gap-4 border-b border-molim pb-5">
            <div>
              <p className="text-sm font-bold text-[#ed542f]">الموارد البشرية</p>

              <h1 className="mt-2 text-3xl font-black text-molim-foreground">
                إضافة الأعضاء
              </h1>

              <p className="mt-3 text-sm leading-7 text-molim-muted">
                إضافة الأعضاء والمتطوعين يدوياً وتزويدهم برمز ربط لمرة واحدة.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="shrink-0 bg-[#ed542f] px-4 py-3 text-xs font-black text-white transition hover:bg-[#d94725]"
            >
              + إضافة متطوع
            </button>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-2">
            <StatCard title="الإجمالي" value={members.length} note="كل الأعضاء" />
            <StatCard title="نشط" value={activeCount} note="حسابات مفعّلة" />
            <StatCard
              title="بانتظار الاعتماد"
              value={pendingCount}
              note="قيد المراجعة"
            />
            <StatCard
              title="لم يكملوا ملفهم"
              value={incompleteCount}
              note="بانتظار إكمال البيانات"
            />
          </section>

          <section className="mt-7 border border-molim bg-molim-soft p-5">
            <label className="mb-2 block text-xs font-black">البحث</label>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو Molim ID أو القسم..."
              className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm outline-none focus:border-[#ed542f]"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {roleFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`cursor-pointer border px-3 py-2 text-xs font-bold transition ${
                    activeFilter === filter
                      ? "border-[#ed542f] bg-[#ed542f] text-white"
                      : "border-molim bg-molim-surface text-molim-foreground hover:border-[#ed542f]"
                  }`}
                >
                  {filter === "الكل" ? "الكل" : ROLE_NAMES[filter]}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-black text-molim-foreground">
                الأعضاء
              </h2>

              <p className="text-xs text-molim-muted">{filtered.length} عضو</p>
            </div>

            {filtered.length === 0 ? (
              <div className="border border-dashed border-molim bg-molim-soft p-8 text-center">
                <p className="font-bold">لا يوجد أعضاء</p>
                <p className="mt-2 text-xs text-molim-muted">
                  لم تتم إضافة أي عضو مطابق بعد.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((member) => (
                  <div
                    key={member.id}
                    className="border border-molim bg-molim-soft p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-black text-molim-foreground">
                            {member.profileCompleted === false
                              ? "لم يكمل بياناته بعد"
                              : member.name}
                          </h3>

                          <span className="border border-molim px-2 py-1 text-[10px] font-bold">
                            {ROLE_NAMES[member.role]}
                          </span>

                          {member.profileCompleted === false && (
                            <span className="border border-yellow-200 bg-yellow-50 px-2 py-1 text-[10px] font-bold text-yellow-700">
                              بانتظار إكمال الملف
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-molim-muted">
                          <span>{member.id}</span>
                          <span>{member.department}</span>
                          <span>{statusToArabic(member.status)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="mt-8 border-t border-molim pt-5 text-center">
            <p className="text-[10px] text-molim-muted">
              مُلم — إدارة الأعضاء
            </p>
          </footer>
        </div>

        {showCreateForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowCreateForm(false);
                resetForm();
              }
            }}
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-molim bg-molim-soft p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-molim-muted">الأعضاء</p>
                  <h2 className="mt-1 text-xl font-black text-molim-foreground">
                    إضافة عضو جديد
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    resetForm();
                  }}
                  className="cursor-pointer border border-molim bg-molim-surface px-3 py-2 hover:border-[#ed542f]"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-black">القسم</label>
                  <select
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm outline-none focus:border-[#ed542f]"
                  >
                    <option value="">بدون قسم</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>

                {createError && (
                  <p className="bg-red-50 p-3 text-xs font-semibold text-red-600">
                    {createError}
                  </p>
                )}

                <button
                  type="button"
                  disabled={creating}
                  onClick={handleCreate}
                  className="h-12 w-full cursor-pointer bg-[#ed542f] text-sm font-black text-white hover:bg-[#d94725] disabled:cursor-wait disabled:opacity-70"
                >
                  {creating ? "جاري الإضافة..." : "إضافة العضو"}
                </button>
              </div>
            </div>
          </div>
        )}

        {createdResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md border border-molim bg-molim-soft p-5 shadow-2xl">
              <p className="text-xs text-molim-muted">تمت الإضافة بنجاح</p>

              <h2 className="mt-1 text-xl font-black text-molim-foreground">
                رمز ربط العضو
              </h2>

              <p className="mt-2 text-xs leading-6 text-molim-muted">
                سلِّم هذا الرمز أو الرسالة الجاهزة للعضو لتسجيل الدخول وإكمال بياناته.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="border border-molim bg-molim-surface p-4">
                  <p className="text-[10px] text-molim-muted">معرّف العضو (Molim ID)</p>
                  <p className="mt-1 text-sm font-black">{createdResult.id}</p>
                </div>

                <div className="border border-[#ed542f]/30 bg-[#ed542f]/5 p-4">
                  <p className="text-[10px] text-molim-muted">رمز الدخول</p>
                  <p className="mt-1 text-sm font-black tracking-widest text-[#ed542f]">
                    {createdResult.linkCode}
                  </p>
                </div>
              </div>

              <div className="mt-3 border border-molim bg-molim-surface p-3">
                <p className="mb-1 text-[10px] text-molim-muted">الرسالة الجاهزة للمتطوع:</p>
                <p className="select-all border border-molim bg-molim-soft p-2.5 text-xs font-mono leading-5 text-molim-foreground">
                  {`مرحباً، تم تسجيلك في مُلم. معرّفك: ${createdResult.id} ، رمز الدخول: ${createdResult.linkCode} (صالح 48 ساعة). افتح تطبيق مُلم في تيليجرام وأدخل الرمز ثم أكمل بياناتك.`}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const message = `مرحباً، تم تسجيلك في مُلم. معرّفك: ${createdResult.id} ، رمز الدخول: ${createdResult.linkCode} (صالح 48 ساعة). افتح تطبيق مُلم في تيليجرام وأدخل الرمز ثم أكمل بياناتك.`;
                    copyCode(message);
                    setCopiedMessage(true);
                    setTimeout(() => setCopiedMessage(false), 2500);
                  }}
                  className="h-12 w-full cursor-pointer bg-[#ed542f] text-sm font-black text-white hover:bg-[#d94725]"
                >
                  {copiedMessage
                    ? "✓ تم نسخ الرسالة بنجاح!"
                    : "نسخ الرسالة الجاهزة للمتطوع"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreatedResult(null);
                    setCopiedMessage(false);
                  }}
                  className="h-10 w-full cursor-pointer border border-molim bg-molim-surface text-xs font-bold text-molim-foreground hover:border-[#ed542f]"
                >
                  تم
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
  note,
}: {
  title: string;
  value: number;
  note: string;
}) {
  return (
    <div className="border border-molim bg-molim-soft p-4">
      <p className="text-[10px] font-bold text-molim-muted">{title}</p>
      <p className="mt-3 text-3xl font-black text-molim-foreground">{value}</p>
      <p className="mt-1 text-[10px] text-molim-muted">{note}</p>
    </div>
  );
}
