"use client";

import Link from "next/link";

const members = [
  {
    name: "أصيل",
    role: "الرئيس العام",
  },
  {
    name: "أحمد",
    role: "رئيس القسم",
  },
  {
    name: "محمد",
    role: "متطوع",
  },
  {
    name: "سارة",
    role: "متطوعة",
  },
];

const departmentTasks = [
  {
    title: "إعداد التقرير الأسبوعي",
    status: "مكتملة",
  },
  {
    title: "مراجعة المحتوى",
    status: "قيد العمل",
  },
  {
    title: "جمع فرص جديدة",
    status: "للمراجعة",
  },
];

export default function DepartmentPage() {
  return (
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
        {/* الهيدر */}
        <header className="flex items-center justify-between border-b border-[#202124]/10 pb-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center bg-[#ed542f] text-xl font-black text-white">
              م
            </div>

            <div>
              <p className="text-[11px] text-molim-muted">
                منصة الفريق
              </p>

              <h1 className="text-lg font-black text-molim-foreground">
                مُلم
              </h1>
            </div>
          </Link>

          <Link
            href="/notifications"
            className="flex h-10 w-10 items-center justify-center border border-molim bg-molim-soft text-lg"
            aria-label="الإشعارات"
          >
            🔔
          </Link>
        </header>

        {/* العنوان */}
        <section className="mt-9">
          <p className="text-sm font-bold text-[#ed542f]">
            القسم
          </p>

          <h2 className="mt-2 text-3xl font-black text-molim-foreground">
            قسم الإدارة
          </h2>

          <p className="mt-3 text-sm leading-6 text-molim-muted">
            تعرّف على قسمك وأعضائه والمهام المرتبطة به من مكان واحد.
          </p>
        </section>

        {/* معلومات القسم */}
        <section className="mt-7 border border-molim bg-molim-soft p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#f3f1ec] p-4">
              <p className="text-[11px] text-molim-muted">
                اسم القسم
              </p>

              <p className="mt-1 text-sm font-black text-molim-foreground">
                الإدارة
              </p>
            </div>

            <div className="bg-[#f3f1ec] p-4">
              <p className="text-[11px] text-molim-muted">
                رئيس القسم
              </p>

              <p className="mt-1 text-sm font-black text-molim-foreground">
                أحمد
              </p>
            </div>
          </div>

          <div className="mt-3 border-t border-molim pt-4">
            <p className="text-[11px] text-molim-muted">
              وصف القسم
            </p>

            <p className="mt-1 text-sm leading-7 text-molim-muted">
              مسؤول عن متابعة الأعمال الإدارية وتنظيم مهام الفريق
              ودعم سير العمل الداخلي في فريق مُلم.
            </p>
          </div>
        </section>

        {/* الإحصائيات */}
        <section className="mt-5 grid grid-cols-3 gap-px border border-molim bg-molim-soft">
          <div className="bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              الأعضاء
            </p>

            <p className="mt-2 text-2xl font-black text-molim-foreground">
              4
            </p>
          </div>

          <div className="bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              المهام
            </p>

            <p className="mt-2 text-2xl font-black text-molim-foreground">
              3
            </p>
          </div>

          <div className="bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              المكتملة
            </p>

            <p className="mt-2 text-2xl font-black text-molim-foreground">
              1
            </p>
          </div>
        </section>

        {/* الإدارة العليا */}
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-lg font-black text-molim-foreground">
              الإدارة
            </h2>

            <p className="mt-1 text-xs text-molim-muted">
              المسؤولون عن القسم ومرجعه الإداري.
            </p>
          </div>

          <div className="space-y-2">
            {members.slice(0, 2).map((member) => (
              <div
                key={member.name + member.role}
                className="flex items-center border border-molim bg-molim-soft p-4"
              >
                <div className="flex h-11 w-11 items-center justify-center bg-[#ed542f]/10 text-sm font-black text-[#ed542f]">
                  {member.name.charAt(0)}
                </div>

                <div className="mr-3">
                  <p className="text-sm font-black text-molim-foreground">
                    {member.name}
                  </p>

                  <p className="mt-1 text-[11px] text-molim-muted">
                    {member.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* أعضاء القسم */}
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-lg font-black text-molim-foreground">
              أعضاء القسم
            </h2>

            <p className="mt-1 text-xs text-molim-muted">
              الأشخاص المنضمون إلى هذا القسم.
            </p>
          </div>

          <div className="space-y-2">
            {members.slice(2).map((member) => (
              <div
                key={member.name + member.role}
                className="flex items-center border border-molim bg-molim-soft p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center bg-molim-soft text-sm font-black text-molim-foreground">
                  {member.name.charAt(0)}
                </div>

                <div className="mr-3">
                  <p className="text-sm font-bold text-molim-foreground">
                    {member.name}
                  </p>

                  <p className="mt-1 text-[11px] text-molim-muted">
                    {member.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* مهام القسم */}
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-black text-molim-foreground">
                مهام القسم
              </h2>

              <p className="mt-1 text-xs text-molim-muted">
                نظرة مختصرة على أعمال القسم.
              </p>
            </div>

            <Link
              href="/work"
              className="text-xs font-bold text-[#ed542f]"
            >
              مهامي
            </Link>
          </div>

          <div className="space-y-2">
            {departmentTasks.map((task) => (
              <div
                key={task.title}
                className="border border-molim bg-molim-soft p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-molim-foreground">
                    {task.title}
                  </p>

                  <TaskStatus status={task.status} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* تنبيه الخصوصية */}
        <section className="mt-8 border-r-4 border-[#ed542f] bg-molim-soft px-5 py-4">
          <p className="text-xs font-black text-molim-foreground">
            🔐 خصوصية الأعضاء
          </p>

          <p className="mt-1 text-xs leading-6 text-molim-muted">
            تظهر هنا فقط المعلومات التي تسمح بها صلاحيات حسابك.
            البيانات الخاصة مثل رقم الهاتف والبريد الإلكتروني
            وبيانات Telegram لا تظهر لأعضاء القسم.
          </p>
        </section>

        <footer className="mt-10 border-t border-molim pt-6 text-center">
          <p className="text-[11px] text-molim-muted">
            مُلم — إدارة فريقك بشكل أبسط وآمن وسلس
          </p>
        </footer>
      </div>
    </main>
  );
}

function TaskStatus({
  status,
}: {
  status: string;
}) {
  const className =
    status === "مكتملة"
      ? "border-green-200 bg-green-50 text-green-700"
      : status === "للمراجعة"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-yellow-200 bg-yellow-50 text-yellow-700";

  return (
    <span
      className={`shrink-0 border px-2 py-1 text-[10px] font-bold ${className}`}
    >
      {status}
    </span>
  );
}