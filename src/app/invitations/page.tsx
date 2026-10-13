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

  const [form, setForm] = useState({
    firstName: "",
    fatherName: "",
    lastName: "",
    email: "",
    phone: "",
    departmentId: "",
    role: "VOLUNTEER" as UserRole,
    status: "pending",
    telegramId: "",
  });

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
        activeFilter === "ط§ظ„ظƒظ„" || member.role === activeFilter;

      const matchesSearch =
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.id.toLowerCase().includes(query) ||
        member.department.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [members, activeFilter, search]);

  function resetForm() {
    setForm({
      firstName: "",
      fatherName: "",
      lastName: "",
      email: "",
      phone: "",
      departmentId: "",
      role: "VOLUNTEER",
      status: "pending",
      telegramId: "",
    });
    setCreateError("");
  }

  async function handleCreate() {
    if (creating) return;

    if (!form.firstName.trim()) {
      setCreateError("ط§ظ„ط§ط³ظ… ط§ظ„ط£ظˆظ„ ظ…ط·ظ„ظˆط¨.");
      return;
    }

    setCreating(true);
    setCreateError("");

    const result = await addMember({
      firstName: form.firstName,
      fatherName: form.fatherName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      departmentId: form.departmentId || null,
      role: form.role,
      status: form.status,
      telegramId: form.telegramId ? Number(form.telegramId) : undefined,
    });

    setCreating(false);

    if (!result.member || !result.linkCode) {
      setCreateError(result.error || "طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط§ظ„ط¹ط¶ظˆ.");
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
                            {member.name}
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

              <div className="mt-5 space-y-3">
                <Field
                  label="ط§ظ„ط§ط³ظ… ط§ظ„ط£ظˆظ„"
                  value={form.firstName}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, firstName: value }))
                  }
                />
                <Field
                  label="ط§ط³ظ… ط§ظ„ط£ط¨"
                  value={form.fatherName}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, fatherName: value }))
                  }
                />
                <Field
                  label="ط§ط³ظ… ط§ظ„ط¹ط§ط¦ظ„ط©"
                  value={form.lastName}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, lastName: value }))
                  }
                />
                <TelegramIdInput
                  value={form.telegramId}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, telegramId: value }))
                  }
                />

                <Field
                  label="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ (ط§ط®طھظٹط§ط±ظٹ)"
                  value={form.email}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, email: value }))
                  }
                />

                <Field
                  label="ط±ظ‚ظ… ط§ظ„ط¬ظˆط§ظ„ (ط§ط®طھظٹط§ط±ظٹ)"
                  value={form.phone}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, phone: value }))
                  }
                />

                <div>
                  <label className="mb-2 block text-xs font-black">ط§ظ„ظ‚ط³ظ…</label>
                  <select
                    value={form.departmentId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        departmentId: event.target.value,
                      }))
                    }
                    className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm outline-none focus:border-[#ed542f]"
                  >
                    <option value="">ط¨ط¯ظˆظ† ظ‚ط³ظ…</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black">ط§ظ„ط¯ظˆط±</label>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        role: event.target.value as UserRole,
                      }))
                    }
                    className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm outline-none focus:border-[#ed542f]"
                  >
                    {(Object.keys(ROLE_NAMES) as UserRole[]).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_NAMES[role]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black">ط§ظ„ط­ط§ظ„ط©</label>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                    className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm outline-none focus:border-[#ed542f]"
                  >
                    <option value="pending">ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯</option>
                    <option value="active">ظ†ط´ط·</option>
                    <option value="inactive">ط؛ظٹط± ظ†ط´ط·</option>
                    <option value="suspended">ظ…ظˆظ‚ظˆظپ</option>
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
                  {creating ? "ط¬ط§ط±ظٹ ط§ظ„ط¥ط¶ط§ظپط©..." : "ط¥ط¶ط§ظپط© ط§ظ„ط¹ط¶ظˆ"}
                </button>
              </div>
            </div>
          </div>
        )}

        {createdResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md border border-molim bg-molim-soft p-5 shadow-2xl">
              <p className="text-xs text-molim-muted">طھظ…طھ ط§ظ„ط¥ط¶ط§ظپط©</p>

              <h2 className="mt-1 text-xl font-black text-molim-foreground">
                ط±ظ…ط² ط±ط¨ط· ط§ظ„ط¹ط¶ظˆ
              </h2>

              <p className="mt-2 text-xs leading-6 text-molim-muted">
                ط³ظ„ظ‘ظ… ظ‡ط°ط§ ط§ظ„ط±ظ…ط² ظ„ظ„ط¹ط¶ظˆ. ظٹظڈط³طھط®ط¯ظ… ظ…ط±ط© ظˆط§ط­ط¯ط© ظپظ‚ط· ظˆطھظ†طھظ‡ظٹ طµظ„ط§ط­ظٹطھظ‡
                طھظ„ظ‚ط§ط¦ظٹظ‹ط§.
              </p>

              <div className="mt-4 border border-molim bg-molim-surface p-4">
                <p className="text-[10px] text-molim-muted">Molim ID</p>
                <p className="mt-1 text-sm font-black">{createdResult.id}</p>
              </div>

              <div className="mt-2 border border-[#ed542f]/30 bg-[#ed542f]/5 p-4">
                <p className="text-[10px] text-molim-muted">ط±ظ…ط² ط§ظ„ط±ط¨ط·</p>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-lg font-black tracking-widest">
                    {createdResult.linkCode}
                  </p>

                  <button
                    type="button"
                    onClick={() => copyCode(createdResult.linkCode)}
                    className="cursor-pointer border border-molim bg-molim-surface px-3 py-2 text-xs font-bold hover:border-[#ed542f]"
                  >
                    ظ†ط³ط®
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCreatedResult(null)}
                className="mt-4 h-12 w-full bg-[#ed542f] text-sm font-black text-white"
              >
                طھظ…
              </button>
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

type TelegramIdInputProps = {
  value: string;
  onChange: (value: string) => void;
};

function TelegramIdInput({ value, onChange }: TelegramIdInputProps) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black">
        معرّف تيليجرام (اختياري)
      </label>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={value}
        onChange={(event) => {
          const numeric = event.target.value.replace(/\D/g, "");
          onChange(numeric);
        }}
        placeholder="أرقام فقط"
        className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm text-right outline-none placeholder:text-molim-muted focus:border-[#ed542f]"
      />
      <p className="mt-1 text-[11px] leading-5 text-molim-muted">
        اختياري. إذا تُرك فارغاً، فسيُصدر النظام رمز ربط للعضو.
      </p>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function Field({ label, value, onChange, placeholder }: FieldProps) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full border border-molim bg-molim-surface px-4 text-sm outline-none placeholder:text-molim-muted focus:border-[#ed542f]"
      />
    </div>
  );
}

