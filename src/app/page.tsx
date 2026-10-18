"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Card from "./components/Card";
import Button from "./components/Button";
import PageShell from "./components/PageShell";
import PageTitle from "./components/PageTitle";
import { useAuth } from "./lib/auth-context";
import { fetchMyHours } from "./lib/supabase/dto";
import type { UserRole } from "./lib/roles";

const ROLE_MESSAGES = {
  VOLUNTEER:
    "تابع مهامك وساعاتك وكل ما يتعلق بعملك داخل فريق مُلم.",
  DEPARTMENT_HEAD:
    "تابع مهامك ومهام قسمك وأعمال الفريق المسندة إليك.",
  HR:
    "تابع شؤون المتطوعين والاتفاقيات والشهادات والبيانات الإدارية.",
  ADMIN:
    "تابع أداء الفريق والأقسام والمهام والساعات من مكان واحد.",
  SUPER_ADMIN:
    "تابع وأدر جميع أعمال فريق مُلم واتخذ الإجراءات اللازمة.",
} as const;

const ROLE_HOME: Record<UserRole, string> = {
  VOLUNTEER: "/",
  DEPARTMENT_HEAD: "/",
  HR: "/",
  ADMIN: "/",
  SUPER_ADMIN: "/",
};

export default function Home() {
  const { user, role, roleName, status, isReady } = useAuth();
  const router = useRouter();
  const roleMessage = ROLE_MESSAGES[role] || ROLE_MESSAGES.VOLUNTEER;

  const [approvedHours, setApprovedHours] = useState<number>(0);
  const [tasksTotal, setTasksTotal] = useState<number>(0);
  const [tasksPending, setTasksPending] = useState<number>(0);

  useEffect(() => {
    if (!isReady || status !== "authenticated") return;

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
          setApprovedHours(total);
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
          setTasksTotal(data.tasks.length);
          const pending = data.tasks.filter(
            (t: { status: string }) =>
              t.status === "in_progress" || t.status === "review"
          ).length;
          setTasksPending(pending);
        }
      })
      .catch(() => {});
  }, [isReady, status]);

  useEffect(() => {
    if (!isReady) return;

    if (status === "needs_linking") {
      router.replace("/link");
      return;
    }

    if (status === "unauthenticated") {
      router.replace("/join");
      return;
    }

    if (status === "authenticated") {
      if (user && user.profileCompleted === false) {
        router.replace("/complete-profile");
        return;
      }

      if (user && user.status !== "active") {
        router.replace("/account");
        return;
      }

      const target = ROLE_HOME[user?.role || role];
      if (target && target !== "/") {
        router.replace(target);
      }
    }
  }, [status, isReady, user, role, router]);

  if (!isReady || status === "loading") {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-molim-muted">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-molim-orange border-t-transparent" />
            <span className="text-sm font-bold">
              جاري التحقق من حسابك...
            </span>
          </div>
        </div>
      </PageShell>
    );
  }

  if (status === "needs_linking" || status === "unauthenticated") {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-molim-muted">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-molim-orange border-t-transparent" />
            <span className="text-sm font-bold">
              جاري توجيهك...
            </span>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* مقدمة الصفحة */}
      <PageTitle
        category={roleName}
        title={`أهلًا، ${user.name}`}
        description={roleMessage}
      />

      {/* المعلومات الأساسية */}
      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="الاسم"
          value={user.name}
        />

        <InfoCard
          title="القسم"
          value={user.department}
        />

        <InfoCard
          title="الصلاحية"
          value={roleName}
          href="/account"
        />
      </section>


      {/* ملخص المهام */}
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-molim-muted">
                مهامي
              </p>

              <p className="mt-2 text-3xl font-black">
                {tasksTotal}
              </p>

              <p className="mt-2 text-xs leading-5 text-molim-muted">
                إجمالي المهام المسجلة في حسابك.
              </p>
            </div>

            <div className="bg-molim-soft px-3 py-2 text-sm font-bold text-molim-blue">
              مهام
            </div>
          </div>

          <div className="mt-5">
            <Link href="/tasks">
              <Button variant="secondary" className="w-full">
                عرض مهامي
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-molim-muted">
                الساعات المعتمدة
              </p>

              <p className="mt-2 text-3xl font-black">
                {approvedHours}
              </p>

              <p className="mt-2 text-xs leading-5 text-molim-muted">
                إجمالي الساعات التطوعية المعتمدة.
              </p>
            </div>

            <div className="bg-molim-soft px-3 py-2 text-sm font-bold text-molim-orange">
              ساعات
            </div>
          </div>

          <div className="mt-5">
            <Link href="/hours">
              <Button variant="primary" className="w-full">
                عرض الساعات
              </Button>
            </Link>
          </div>
        </Card>
      </section>

      {/* حالة العمل */}
      <section className="mt-6">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-molim-muted">
                حالة العمل
              </p>

              <h2 className="mt-1 text-lg font-black">
                {tasksPending > 0 ? "تحتاج متابعة" : "لا توجد مهام معلقة"}
              </h2>
            </div>

            <span className="border border-molim-orange bg-molim-soft px-3 py-1 text-xs font-bold text-molim-orange">
              {tasksPending} مهام
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-molim-muted">
            توجد مهام تحتاج إلى متابعة أو إكمال من حسابك.
          </p>

          <div className="mt-5">
            <Link href="/tasks">
              <Button variant="outline">
                الانتقال إلى المهام
              </Button>
            </Link>
          </div>
        </Card>
      </section>

      {/* القسم */}
      <section className="mt-6">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-molim-muted">
                القسم
              </p>

              <h2 className="mt-1 text-xl font-black">
                {user.department}
              </h2>
            </div>

            <div className="bg-molim-soft px-3 py-2 text-xs font-bold text-molim-blue">
              الفريق
            </div>
          </div>
        </Card>
      </section>

      {/* إجراء رئيسي حسب الصلاحية */}
      <section className="mt-6">
        {role === "VOLUNTEER" && (
          <Card className="p-5">
            <p className="text-xs text-molim-muted">
              إجراء سريع
            </p>

            <h2 className="mt-1 text-lg font-black">
              تسجيل مهمة جديدة
            </h2>

            <p className="mt-2 text-sm leading-6 text-molim-muted">
              سجّل المهمة التي أنجزتها حتى تدخل مرحلة المراجعة
              واحتساب الساعات.
            </p>

            <div className="mt-4">
              <Link href="/add-task">
                <Button variant="primary">
                  إضافة مهمة
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {role === "DEPARTMENT_HEAD" && (
          <Card className="p-5">
            <p className="text-xs text-molim-muted">
              إدارة القسم
            </p>

            <h2 className="mt-1 text-lg font-black">
              متابعة أعمال القسم
            </h2>

            <p className="mt-2 text-sm leading-6 text-molim-muted">
              يمكنك متابعة مهام القسم والأعضاء وإضافة المهام
              من القائمة الجانبية أو صفحة المهام.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/tasks">
                <Button variant="secondary">
                  مهام القسم
                </Button>
              </Link>

              <Link href="/hours-review">
                <Button variant="outline">
                  مراجعة الساعات
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {role === "HR" && (
          <Card className="p-5">
            <p className="text-xs text-molim-muted">
              الموارد البشرية
            </p>

            <h2 className="mt-1 text-lg font-black">
              إدارة شؤون الفريق
            </h2>

            <p className="mt-2 text-sm leading-6 text-molim-muted">
              يمكنك متابعة المتطوعين وإضافة الأعضاء ومراجعة
              الساعات مباشرة.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/volunteers">
                <Button variant="secondary">
                  المتطوعون
                </Button>
              </Link>

              <Link href="/invitations">
                <Button variant="outline">
                  إضافة الأعضاء
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {role === "ADMIN" && (
          <Card className="p-5">
            <p className="text-xs text-molim-muted">
              الإدارة
            </p>

            <h2 className="mt-1 text-lg font-black">
              متابعة شؤون الفريق
            </h2>

            <p className="mt-2 text-sm leading-6 text-molim-muted">
              يمكنك متابعة المتطوعين ومراجعة المهام والساعات
              من القائمة الجانبية.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/volunteers">
                <Button variant="secondary">
                  المتطوعون
                </Button>
              </Link>

              <Link href="/hours-review">
                <Button variant="outline">
                  مراجعة الساعات
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {role === "SUPER_ADMIN" && (
          <Card className="p-5">
            <p className="text-xs text-molim-muted">
              الرئيس العام
            </p>

            <h2 className="mt-1 text-lg font-black">
              إدارة كيان مُلم
            </h2>

            <p className="mt-2 text-sm leading-6 text-molim-muted">
              الأدوار والصلاحيات الإدارية وسجل العمليات متاحة
              لك مباشرة.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/roles">
                <Button variant="secondary">
                  الأدوار والصلاحيات
                </Button>
              </Link>

              <Link href="/audit-log">
                <Button variant="outline">
                  سجل العمليات
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </section>

      {/* معلومات مختصرة */}
      <section className="mt-6">
        <Card soft className="p-5">
          <p className="text-sm font-bold">
            منصة مُلم
          </p>

          <p className="mt-2 text-xs leading-6 text-molim-muted">
            جميع المعلومات والعمليات تظهر لك حسب صلاحيات حسابك.
            استخدم القائمة الجانبية للوصول إلى الصفحات التي لا
            تحتاج إليها بشكل متكرر.
          </p>
        </Card>
      </section>
    </PageShell>
  );
}

function InfoCard({
  title,
  value,
  href,
}: {
  title: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-xs text-molim-muted">
        {title}
      </p>

      <p className="mt-2 text-lg font-black">
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card className="p-5 transition hover:border-[var(--molim-blue)]">
          {content}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="p-5">
      {content}
    </Card>
  );
}