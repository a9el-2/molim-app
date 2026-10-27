"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RoleGuard from "../components/RoleGuard";
import { fetchAgreements } from "../lib/supabase/dto";

type AgreementStatus =
  | "سارية"
  | "بانتظار التوقيع"
  | "منتهية"
  | "ملغاة";

type Agreement = {
  id: number;
  volunteerName: string;
  molimId: string;
  department: string;
  title: string;
  status: AgreementStatus;
  signedDate: string;
  expiresAt: string;
  createdBy: string;
  notes: string;
};

type FilterType = "الكل" | AgreementStatus;

const initialAgreements: Agreement[] = [
  {
    id: 1,
    volunteerName: "خالد علي",
    molimId: "MOL-00008",
    department: "الإدارة",
    title: "اتفاقية تطوع — إدارة المحتوى",
    status: "سارية",
    signedDate: "2026/06/01",
    expiresAt: "2026/09/01",
    createdBy: "أصيل",
    notes: "التزام بمهام إدارة المحتوى ومتابعة النشر.",
  },
  {
    id: 2,
    volunteerName: "محمد أحمد",
    molimId: "MOL-00012",
    department: "الإدارة",
    title: "اتفاقية تطوع — الشؤون الإدارية",
    status: "سارية",
    signedDate: "2026/07/15",
    expiresAt: "2026/10/15",
    createdBy: "أصيل",
    notes: "دعم الملفات الإدارية وتنظيم أرشيف الفريق.",
  },
  {
    id: 3,
    volunteerName: "سارة محمد",
    molimId: "MOL-00015",
    department: "البحث",
    title: "اتفاقية تطوع — البحث والتحقق",
    status: "بانتظار التوقيع",
    signedDate: "",
    expiresAt: "2026/12/01",
    createdBy: "خالد علي",
    notes: "بانتظار توقيع المتطوعة بعد مقابلة التعارف.",
  },
  {
    id: 4,
    volunteerName: "محمد علي",
    molimId: "MOL-00019",
    department: "الإعلام",
    title: "اتفاقية تطوع — إدارة القنوات",
    status: "بانتظار التوقيع",
    signedDate: "",
    expiresAt: "2026/11/15",
    createdBy: "خالد علي",
    notes: "بانتظار اعتماد الإجراءات النهائية.",
  },
  {
    id: 5,
    volunteerName: "نور الهدى",
    molimId: "MOL-00022",
    department: "التصميم",
    title: "اتفاقية تطوع — التصميم والهوية",
    status: "منتهية",
    signedDate: "2026/03/10",
    expiresAt: "2026/06/10",
    createdBy: "أصيل",
    notes: "انتهت المدة وتم إغلاق الاتفاقية دون تجديد.",
  },
  {
    id: 6,
    volunteerName: "أحمد سمير",
    molimId: "MOL-00025",
    department: "التسويق",
    title: "اتفاقية تطوع — الحملات التسويقية",
    status: "ملغاة",
    signedDate: "",
    expiresAt: "2026/08/20",
    createdBy: "أصيل",
    notes: "أُلغي الاتفاق قبل التوقيع لعدم استكمال الإجراءات.",
  },
];

const filters: FilterType[] = [
  "الكل",
  "سارية",
  "بانتظار التوقيع",
  "منتهية",
  "ملغاة",
];

export default function AgreementsPage() {
  const [agreements, setAgreements] =
    useState<Agreement[]>(initialAgreements);

  const [activeFilter, setActiveFilter] =
    useState<FilterType>("الكل");

  const [search, setSearch] = useState("");

  const [selected, setSelected] =
    useState<Agreement | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  const [volunteerName, setVolunteerName] = useState("");
  const [molimId, setMolimId] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAgreements()
      .then((res) => {
        if (
          cancelled ||
          !res.ok ||
          !res.agreements ||
          res.agreements.length === 0
        )
          return;

        const mapped: Agreement[] = res.agreements.map((a, idx) => {
          const userObj = a.users;
          const name = userObj
            ? [userObj.first_name, userObj.father_name, userObj.last_name]
                .filter(Boolean)
                .join(" ") || "عضو فريق مُلم"
            : "عضو فريق مُلم";

          const statusMap: Record<string, AgreementStatus> = {
            active: "سارية",
            expired: "منتهية",
            renewed: "سارية",
          };

          return {
            id: idx + 100,
            volunteerName: name,
            molimId: a.user_id,
            department: userObj?.department_id ?? "عام",
            title: `اتفاقية تطوع — ${
              a.duration_months === 1
                ? "شهر واحد"
                : a.duration_months === 2
                ? "شهران"
                : `${a.duration_months} أشهر`
            }`,
            status: statusMap[a.status] ?? "سارية",
            signedDate: a.signed_at
              ? a.signed_at.split("T")[0].replace(/-/g, "/")
              : "",
            expiresAt: a.expires_at
              ? a.expires_at.split("T")[0].replace(/-/g, "/")
              : "",
            createdBy: "النظام",
            notes:
              a.notes ??
              "تم توثيق الاتفاقية إلكترونياً واعتمادها في المنصة.",
          };
        });

        setAgreements((prev) => [...mapped, ...prev]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = agreements.filter(
    (agreement) => agreement.status === "سارية"
  ).length;

  const pendingCount = agreements.filter(
    (agreement) => agreement.status === "بانتظار التوقيع"
  ).length;

  const expiredCount = agreements.filter(
    (agreement) => agreement.status === "منتهية"
  ).length;

  const filteredAgreements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return agreements.filter((agreement) => {
      const matchesFilter =
        activeFilter === "الكل" ||
        agreement.status === activeFilter;

      const matchesSearch =
        !query ||
        agreement.volunteerName.toLowerCase().includes(query) ||
        agreement.molimId.toLowerCase().includes(query) ||
        agreement.department.toLowerCase().includes(query) ||
        agreement.title.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [agreements, activeFilter, search]);

  function resetForm() {
    setVolunteerName("");
    setMolimId("");
    setDepartment("");
    setTitle("");
    setFormError("");
  }

  function createAgreement() {
    if (
      !volunteerName.trim() ||
      !molimId.trim() ||
      !title.trim()
    ) {
      setFormError(
        "أكمل بيانات المتطوع ونوع الاتفاقية أولًا."
      );
      return;
    }

    const createdDate = new Date();

    const expiresDate = new Date(createdDate);
    expiresDate.setMonth(expiresDate.getMonth() + 3);

    const newAgreement: Agreement = {
      id: Date.now(),
      volunteerName: volunteerName.trim(),
      molimId: molimId.trim(),
      department:
        department.trim() || "غير محدد",
      title: title.trim(),
      status: "بانتظار التوقيع",
      signedDate: "",
      expiresAt: expiresDate.toLocaleDateString(
        "ar-SA"
      ),
      createdBy: "أصيل",
      notes: "بانتظار توقيع المتطوع.",
    };

    setAgreements((current) => [
      newAgreement,
      ...current,
    ]);

    setShowCreate(false);
    resetForm();
    setActiveFilter("بانتظار التوقيع");
  }

  function signAgreement(id: number) {
    const today = new Date().toLocaleDateString("ar-SA");

    setAgreements((current) =>
      current.map((agreement) =>
        agreement.id === id
          ? {
              ...agreement,
              status: "سارية",
              signedDate: today,
              notes: "تم توقيع الاتفاقية.",
            }
          : agreement
      )
    );

    setSelected((current) =>
      current
        ? {
            ...current,
            status: "سارية",
            signedDate: today,
            notes: "تم توقيع الاتفاقية.",
          }
        : null
    );
  }

  function renewAgreement(id: number) {
    const createdDate = new Date();

    const expiresDate = new Date(createdDate);
    expiresDate.setMonth(expiresDate.getMonth() + 3);

    const nextExpiry =
      expiresDate.toLocaleDateString("ar-SA");

    setAgreements((current) =>
      current.map((agreement) =>
        agreement.id === id
          ? {
              ...agreement,
              status: "سارية",
              expiresAt: nextExpiry,
              notes: "تم تجديد الاتفاقية لمدة ثلاثة أشهر.",
            }
          : agreement
      )
    );

    setSelected((current) =>
      current
        ? {
            ...current,
            status: "سارية",
            expiresAt: nextExpiry,
            notes: "تم تجديد الاتفاقية لمدة ثلاثة أشهر.",
          }
        : null
    );
  }

  function deleteAgreement(id: number) {
    setAgreements((current) =>
      current.filter(
        (agreement) => agreement.id !== id
      )
    );
    setSelected(null);
  }

  function statusStyle(status: AgreementStatus) {
    if (status === "سارية") {
      return "border-green-200 bg-green-50 text-green-700";
    }

    if (status === "بانتظار التوقيع") {
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    }

    if (status === "منتهية") {
      return "border-molim bg-molim-soft text-molim-foreground";
    }

    return "border-red-200 bg-red-50 text-red-700";
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
        </div>

        <div className="relative mx-auto max-w-md px-5 pb-14 pt-7">
          {/* Breadcrumb */}
          <div className="mb-5 text-xs text-molim-muted">
            <Link
              href="/"
              className="hover:text-[#ed542f]"
            >
              الرئيسية
            </Link>

            <span className="mx-2">←</span>

            <span>الموارد البشرية</span>

            <span className="mx-2">←</span>

            <span className="font-bold text-molim-foreground">
              اتفاقيات التطوع
            </span>
          </div>

          {/* الهيدر */}
          <section className="flex items-end justify-between gap-4 border-b border-molim pb-5">
            <div>
              <h1 className="text-3xl font-black text-molim-foreground">
                اتفاقيات التطوع
              </h1>

              <p className="mt-3 text-sm leading-7 text-molim-muted">
                متابعة اتفاقيات المتطوعين وعقود التطوع
                وحالاتها ومددها.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowCreate(true);
              }}
              className="shrink-0 bg-[#ed542f] px-4 py-3 text-xs font-black text-white"
            >
              + اتفاقية
            </button>
          </section>

          {/* الإحصائيات */}
          <section className="mt-6 grid grid-cols-3 gap-px border border-molim bg-molim-soft">
            <Stat
              label="سارية"
              value={String(activeCount)}
            />

            <Stat
              label="بانتظار التوقيع"
              value={String(pendingCount)}
            />

            <Stat
              label="منتهية"
              value={String(expiredCount)}
            />
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
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="ابحث بالاسم أو Molim ID أو القسم..."
                className="h-14 w-full border border-molim bg-molim-soft px-11 text-sm outline-none placeholder:text-molim-muted focus:border-[#ed542f]"
              />
            </div>
          </section>

          {/* الفلاتر */}
          <section className="mt-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filters.map((filter) => {
                const selected = activeFilter === filter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`shrink-0 border px-4 py-2 text-xs font-bold transition ${
                      selected
                        ? "border-[#ed542f] bg-[#ed542f] text-white"
                        : "border-molim bg-molim-soft text-molim-muted"
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </section>

          {/* القائمة */}
          <section className="mt-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h3 className="text-lg font-black text-molim-foreground">
                  قائمة الاتفاقيات
                </h3>

                <p className="mt-1 text-xs text-molim-muted">
                  {filteredAgreements.length} اتفاقية
                </p>
              </div>
            </div>

            {filteredAgreements.length > 0 ? (
              <div className="space-y-2">
                {filteredAgreements.map((agreement) => (
                  <button
                    key={agreement.id}
                    type="button"
                    onClick={() => setSelected(agreement)}
                    className="block w-full cursor-pointer border border-molim bg-molim-surface p-4 text-right transition hover:border-[#ed542f]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">
                            {agreement.volunteerName}
                          </p>

                          <span className="bg-molim-soft px-2 py-0.5 text-[10px] text-molim-muted">
                            {agreement.molimId}
                          </span>
                        </div>

                        <p className="mt-1.5 text-sm text-molim-foreground">
                          {agreement.title}
                        </p>

                        <p className="mt-1 text-xs text-molim-muted">
                          {agreement.department}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 border px-2 py-1 text-xs font-bold ${statusStyle(
                          agreement.status
                        )}`}
                      >
                        {agreement.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-molim bg-molim-surface p-10 text-center">
                <p className="font-bold text-molim-foreground">
                  لا توجد اتفاقيات
                </p>

                <p className="mt-2 text-sm text-molim-muted">
                  لا توجد اتفاقيات مطابقة للبحث أو الحالة.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* تفاصيل الاتفاقية */}
        {selected && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelected(null);
              }
            }}
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-molim bg-molim-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-molim-muted">
                    تفاصيل الاتفاقية
                  </p>

                  <h2 className="mt-1 text-lg font-black text-molim-foreground">
                    {selected.volunteerName}
                  </h2>

                  <p className="mt-1 text-xs text-molim-muted">
                    {selected.molimId}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="bg-molim-soft px-3 py-2 text-molim-foreground"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <InfoBox
                  title="نوع الاتفاقية"
                  value={selected.title}
                />

                <InfoBox
                  title="القسم"
                  value={selected.department}
                />

                <InfoBox
                  title="الحالة"
                  value={selected.status}
                />

                <InfoBox
                  title="تاريخ التوقيع"
                  value={
                    selected.signedDate || "لم يُوقَّع بعد"
                  }
                />

                <InfoBox
                  title="تاريخ الانتهاء"
                  value={selected.expiresAt}
                />

                <div className="border border-molim bg-molim-soft p-4">
                  <p className="text-xs text-molim-muted">
                    ملاحظات
                  </p>

                  <p className="mt-1 text-sm leading-6 text-molim-foreground">
                    {selected.notes}
                  </p>
                </div>

                {selected.status === "بانتظار التوقيع" && (
                  <button
                    type="button"
                    onClick={() => signAgreement(selected.id)}
                    className="h-12 w-full cursor-pointer bg-green-600 font-bold text-white transition hover:bg-green-700"
                  >
                    ✍ تعميم التوقيع
                  </button>
                )}

                {(selected.status === "سارية" ||
                  selected.status === "منتهية") && (
                  <button
                    type="button"
                    onClick={() => renewAgreement(selected.id)}
                    className="h-12 w-full cursor-pointer border border-molim bg-molim-surface font-bold text-molim-foreground transition hover:bg-molim-soft"
                  >
                    ↻ تجديد الاتفاقية
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => deleteAgreement(selected.id)}
                  className="h-12 w-full cursor-pointer bg-red-600 font-bold text-white transition hover:bg-red-700"
                >
                  🗑 حذف الاتفاقية
                </button>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="h-12 w-full cursor-pointer border border-molim bg-molim-surface font-semibold text-molim-foreground transition hover:bg-molim-soft"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* إنشاء اتفاقية */}
        {showCreate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowCreate(false);
              }
            }}
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-molim bg-molim-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-molim-muted">
                    الموارد البشرية
                  </p>

                  <h2 className="mt-1 text-xl font-black text-molim-foreground">
                    اتفاقية تطوع جديدة
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="bg-molim-soft px-3 py-2 text-molim-foreground"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <Field
                  label="اسم المتطوع"
                  value={volunteerName}
                  onChange={setVolunteerName}
                  placeholder="مثال: سارة محمد"
                />

                <Field
                  label="Molim ID"
                  value={molimId}
                  onChange={setMolimId}
                  placeholder="مثال: MOL-00015"
                />

                <Field
                  label="القسم"
                  value={department}
                  onChange={setDepartment}
                  placeholder="مثال: البحث"
                />

                <Field
                  label="نوع الاتفاقية"
                  value={title}
                  onChange={setTitle}
                  placeholder="مثال: اتفاقية تطوع — البحث والتحقق"
                />

                {formError && (
                  <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={createAgreement}
                  className="h-12 w-full cursor-pointer bg-[#ed542f] font-bold text-white transition hover:bg-[#d94725]"
                >
                  إنشاء الاتفاقية
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
      <p className="text-xl font-black text-molim-foreground">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-molim-muted">
        {label}
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

      <p className="mt-1 font-semibold text-molim-foreground">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-molim-foreground">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full border border-molim bg-molim-soft px-4 text-sm outline-none placeholder:text-molim-muted focus:border-[#ed542f]"
      />
    </div>
  );
}