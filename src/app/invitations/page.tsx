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

type RoleFilter = "ط§ظ„ظƒظ„" | UserRole;

const roleFilters: RoleFilter[] = [
  "ط§ظ„ظƒظ„",
  "VOLUNTEER",
  "DEPARTMENT_HEAD",
  "HR",
  "ADMIN",
  "SUPER_ADMIN",
];

export default function MembersPage() {
  const [members, setMembers] = useState<UserDTO[]>([]);
  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);
  const [activeFilter, setActiveFilter] = useState<RoleFilter>("ط§ظ„ظƒظ„");
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
              ط§ظ„ط±ط¦ظٹط³ظٹط©
            </Link>
            <span className="mx-2">â†گ</span>
            <span>ط§ظ„ظ…ظˆط§ط±ط¯ ط§ظ„ط¨ط´ط±ظٹط©</span>
            <span className="mx-2">â†گ</span>
            <span className="font-bold text-molim-foreground">
              ط¥ط¶ط§ظپط© ط§ظ„ط£ط¹ط¶ط§ط،
            </span>
          </div>

          <section className="flex items-end justify-between gap-4 border-b border-molim pb-5">
            <div>
              <p className="text-sm font-bold text-[#ed542f]">ط§ظ„ظ…ظˆط§ط±ط¯ ط§ظ„ط¨ط´ط±ظٹط©</p>

              <h1 className="mt-2 text-3xl font-black text-molim-foreground">
                ط¥ط¶ط§ظپط© ط§ظ„ط£ط¹ط¶ط§ط،
              </h1>

              <p className="mt-3 text-sm leading-7 text-molim-muted">
                ط¥ط¶ط§ظپط© ط§ظ„ط£ط¹ط¶ط§ط، ظٹط¯ظˆظٹظ‹ط§ ظˆطھط²ظˆظٹط¯ظ‡ظ… ط¨ط±ظ…ط² ط±ط¨ط· ظ„ظ…ط±ط© ظˆط§ط­ط¯ط©.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="shrink-0 bg-[#ed542f] px-4 py-3 text-xs font-black text-white"
            >
              + ط¹ط¶ظˆ
            </button>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-2">
            <StatCard title="ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ" value={members.length} note="ظƒظ„ ط§ظ„ط£ط¹ط¶ط§ط،" />
            <StatCard title="ظ†ط´ط·" value={activeCount} note="ط­ط³ط§ط¨ط§طھ ظ…ظپط¹ظ‘ظ„ط©" />
            <StatCard
              title="ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯"
              value={pendingCount}
              note="ظ‚ظٹط¯ ط§ظ„ظ…ط±ط§ط¬ط¹ط©"
            />
            <StatCard
              title="ظ„ظ… ظٹظƒظ…ظ„ظˆط§ ظ…ظ„ظپظ‡ظ…"
              value={incompleteCount}
              note="ط¨ط§ظ†طھط¸ط§ط± ط¥ظƒظ…ط§ظ„ ط§ظ„ط¨ظٹط§ظ†ط§طھ"
            />
          </section>

          <section className="mt-7 border border-molim bg-molim-soft p-5">
            <label className="mb-2 block text-xs font-black">ط§ظ„ط¨ط­ط«</label>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ط§ط¨ط­ط« ط¨ط§ظ„ط§ط³ظ… ط£ظˆ Molim ID ط£ظˆ ط§ظ„ظ‚ط³ظ…..."
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
                  {filter === "ط§ظ„ظƒظ„" ? "ط§ظ„ظƒظ„" : ROLE_NAMES[filter]}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-black text-molim-foreground">
                ط§ظ„ط£ط¹ط¶ط§ط،
              </h2>

              <p className="text-xs text-molim-muted">{filtered.length} ط¹ط¶ظˆ</p>
            </div>

            {filtered.length === 0 ? (
              <div className="border border-dashed border-molim bg-molim-soft p-8 text-center">
                <p className="font-bold">ظ„ط§ ظٹظˆط¬ط¯ ط£ط¹ط¶ط§ط،</p>
                <p className="mt-2 text-xs text-molim-muted">
                  ظ„ظ… طھطھظ… ط¥ط¶ط§ظپط© ط£ظٹ ط¹ط¶ظˆ ظ…ط·ط§ط¨ظ‚ ط¨ط¹ط¯.
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
                              ط¨ط§ظ†طھط¸ط§ط± ط¥ظƒظ…ط§ظ„ ط§ظ„ظ…ظ„ظپ
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
              ظ…ظڈظ„ظ… â€” ط¥ط¯ط§ط±ط© ط§ظ„ط£ط¹ط¶ط§ط،
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
                  <p className="text-xs text-molim-muted">ط§ظ„ط£ط¹ط¶ط§ط،</p>
                  <h2 className="mt-1 text-xl font-black text-molim-foreground">
                    ط¥ط¶ط§ظپط© ط¹ط¶ظˆ ط¬ط¯ظٹط¯
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
                  âœ•
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
              <p className="text-xs text-molim-muted">تمت الإضافة</p>

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

