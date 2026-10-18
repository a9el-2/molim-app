"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";

type MenuItem = {
  title: string;
  href: string;
};

export default function MolimHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, role, roleName } = useAuth();
  const pathname = usePathname();

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return localStorage.getItem("molim-theme") === "dark";
    } catch {
      return false;
    }
  });

  /* =========================================
     مزامنة كلاس الوضع الداكن مع الحالة (DOM فقط)
     ========================================= */
  useEffect(() => {
    const root = document.documentElement;

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  /* =========================================
     تغيير الوضع
     ========================================= */
  function toggleDarkMode() {
    const nextTheme = !isDark;

    setIsDark(nextTheme);

    if (nextTheme) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("molim-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("molim-theme", "light");
    }
  }

  function closeMenu() {
    setIsOpen(false);
  }

  /* =========================================
     الصلاحيات
     ========================================= */
  const isDepartmentHead = role === "DEPARTMENT_HEAD";
  const isHR = role === "HR";
  const isAdmin = role === "ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isUpperManagement = isAdmin || isSuperAdmin;


  /* =========================================
     القائمة الأساسية
     تظهر للجميع
     ========================================= */
  const basicMenu: MenuItem[] = [
    {
      title: "الرئيسية",
      href: "/",
    },
    {
      title: "المهام",
      href: "/tasks",
    },
    {
      title: "الساعات التطوعية",
      href: "/hours",
    },
    {
      title: "حسابي",
      href: "/account",
    },
  ];

  /* =========================================
     رئيس القسم
     ========================================= */
  const departmentMenu: MenuItem[] = [
    {
      title: "إضافة مهمة",
      href: "/add-task",
    },
    {
      title: "مراجعة المهام",
      href: "/task-review",
    },
    {
      title: "مراجعة الساعات",
      href: "/hours-review",
    },
  ];

  /* =========================================
     الموارد البشرية
     ========================================= */
  const hrMenu: MenuItem[] = [
    {
      title: "مراجعة الساعات",
      href: "/hours-review",
    },
    {
      title: "المتطوعون",
      href: "/volunteers",
    },
    {
      title: "إضافة الأعضاء",
      href: "/invitations",
    },
  ];

  /* =========================================
     الإدارة العليا
     ========================================= */
  const adminMenu: MenuItem[] = [
    {
      title: "مراجعة الساعات",
      href: "/hours-review",
    },
    {
      title: "المتطوعون",
      href: "/volunteers",
    },
    {
      title: "مراجعة المهام",
      href: "/task-review",
    },
    {
      title: "الساعات",
      href: "/hours",
    },
    {
      title: "إضافة الأعضاء",
      href: "/invitations",
    },
  ];

  /* =========================================
     الرئيس العام — إدارة النظام
     ========================================= */
  const superAdminMenu: MenuItem[] = [
    {
      title: "الأدوار والصلاحيات",
      href: "/roles",
    },
    {
      title: "سجل العمليات",
      href: "/audit-log",
    },
  ];

  return (
    <>
      {/* =====================================
          الهيدر
          ===================================== */}
      <header className="molim-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">

          {/* زر القائمة */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="فتح القائمة"
            className="molim-button-outline flex h-10 w-10 items-center justify-center p-0 text-lg"
          >
            ☰
          </button>

          {/* شعار مُلم */}
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <div className="flex h-10 w-10 items-center justify-center bg-molim-orange text-lg font-black text-white">
              م
            </div>

            <div className="text-right">
              <p className="text-[10px] text-molim-muted">
                منصة الفريق
              </p>

              <p className="text-base font-black">
                مُلم
              </p>
            </div>
          </Link>

          {/* الوضع الداكن */}
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={
              isDark
                ? "تفعيل الوضع الفاتح"
                : "تفعيل الوضع الداكن"
            }
            className="molim-button-outline flex h-10 w-10 items-center justify-center p-0 text-base"
          >
            {isDark ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {/* =====================================
          خلفية القائمة
          ===================================== */}
      {isOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/40"
        />
      )}

      {/* =====================================
          القائمة الجانبية
          ===================================== */}
      <aside
        aria-label="القائمة الرئيسية"
        className={`molim-sidebar fixed right-0 top-0 z-50 h-full w-[300px] max-w-[85vw] overflow-y-auto transition-transform duration-200 ${
          isOpen
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      >
        {/* معلومات الحساب */}
        <div className="border-b border-molim p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded bg-molim-orange/15 px-2 py-0.5 text-[10px] font-black text-molim-orange">
                {roleName}
              </span>

              <h2 className="mt-1.5 text-lg font-black">
                {user.name}
              </h2>

              <p className="mt-0.5 text-xs text-molim-muted">
                {user.department} — {user.id}
              </p>
            </div>

            <button
              type="button"
              onClick={closeMenu}
              aria-label="إغلاق القائمة"
              className="molim-button-outline flex h-9 w-9 items-center justify-center p-0"
            >
              ×
            </button>
          </div>
        </div>

        <nav className="p-4">

          {/* الأساسي */}
          <MenuSection
            title="الأساسي"
            items={basicMenu}
            pathname={pathname}
            onNavigate={closeMenu}
          />

          {/* رئيس القسم */}
          {isDepartmentHead && (
            <MenuSection
              title="إدارة القسم"
              items={departmentMenu}
              pathname={pathname}
              onNavigate={closeMenu}
            />
          )}

          {/* HR */}
          {isHR && (
            <MenuSection
              title="الموارد البشرية"
              items={hrMenu}
              pathname={pathname}
              onNavigate={closeMenu}
            />
          )}

          {/* الإدارة العليا */}
          {isUpperManagement && (
            <MenuSection
              title="الإدارة"
              items={adminMenu}
              pathname={pathname}
              onNavigate={closeMenu}
            />
          )}

          {/* الرئيس العام */}
          {isSuperAdmin && (
            <MenuSection
              title="إدارة النظام"
              items={superAdminMenu}
              pathname={pathname}
              onNavigate={closeMenu}
            />
          )}

          {/* الوضع الداكن */}
          <section className="mt-4">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="molim-sidebar-item"
            >
              <span>
                {isDark
                  ? "☀ الوضع الفاتح"
                  : "☾ الوضع الداكن"}
              </span>
            </button>
          </section>
        </nav>

        {/* أسفل القائمة */}
        <div className="border-t border-molim px-5 py-4 text-center">
          <p className="text-[10px] text-molim-muted">
            مُلم — إدارة فريقك بشكل أبسط وآمن
          </p>
        </div>
      </aside>
    </>
  );
}

/* =========================================
   قسم من القائمة
   ========================================= */

function isActivePath(href: string, pathname: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href;
}

function MenuSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: MenuItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <section className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-bold text-molim-muted">
        {title}
      </p>

      <div className="space-y-1">
        {items.map((item) => (
          <Link
            key={`${item.title}-${item.href}`}
            href={item.href}
            onClick={onNavigate}
            className={`molim-sidebar-item ${
              isActivePath(item.href, pathname) ? "active" : ""
            }`}
          >
            {item.title}
          </Link>
        ))}
      </div>
    </section>
  );
}