"use client";

import React, { useState } from "react";
import { useAuth, MOCK_PROFILES } from "../lib/auth-context";
import { UserRole, ROLE_NAMES } from "../lib/roles";

const ROLE_ICONS: Record<UserRole, string> = {
  VOLUNTEER: "🙋",
  DEPARTMENT_HEAD: "🏢",
  HR: "👥",
  ADMIN: "🛡️",
  SUPER_ADMIN: "👑",
};

export default function RoleSwitcher() {
  const { user, role, switchRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_DEMO !== "1"
  ) {
    return null;
  }

  const rolesList: UserRole[] = [
    "VOLUNTEER",
    "DEPARTMENT_HEAD",
    "HR",
    "ADMIN",
    "SUPER_ADMIN",
  ];

  return (
    <aside
      aria-label="محول الأدوار السريع"
      dir="rtl"
      className="fixed bottom-4 left-4 z-50 font-sans"
    >
      {/* القائمة المنبثقة للتبديل */}
      {isOpen && (
        <div className="mb-3 w-80 overflow-hidden border border-molim-orange/30 bg-molim-surface/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-molim pb-2">
            <div>
              <p className="text-xs font-black text-molim-orange">
                🎭 محاكي الرتب والصلاحيات
              </p>
              <p className="text-[11px] text-molim-muted">
                بدّل الرتبة لترى الموقع بمنظور مختلف
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm font-bold text-molim-muted hover:text-[var(--foreground)]"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-1.5">
            {rolesList.map((targetRole) => {
              const profile = MOCK_PROFILES[targetRole];
              const isCurrent = role === targetRole;
              const icon = ROLE_ICONS[targetRole];

              return (
                <button
                  key={targetRole}
                  type="button"
                  onClick={() => {
                    switchRole(targetRole);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg p-2.5 text-right transition ${
                    isCurrent
                      ? "border border-molim-orange bg-molim-orange/10 font-black text-molim-orange dark:bg-molim-orange/20"
                      : "border border-transparent hover:bg-molim-soft"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{icon}</span>
                    <div>
                      <p className="text-xs font-bold leading-tight">
                        {ROLE_NAMES[targetRole]}
                      </p>
                      <p className="text-[10px] text-molim-muted">
                        {profile.name} — {profile.department}
                      </p>
                    </div>
                  </div>

                  {isCurrent && (
                    <span className="rounded-full bg-molim-orange px-2 py-0.5 text-[9px] font-bold text-white">
                      نشط الآن
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-molim pt-2 text-center text-[10px] text-molim-muted">
            يتحكم في الصفحات المسموحة والقوائم وسجلات المهام
          </div>
        </div>
      )}

      {/* الزر العائم الدائم */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border-2 border-molim-orange bg-molim-surface px-3.5 py-2 text-xs font-black shadow-lg transition hover:scale-105 active:scale-95"
        title="انقر لتغيير الرتبة ومعاينة الموقع بأدوار أخرى"
      >
        <span className="text-base">{ROLE_ICONS[role]}</span>
        <span className="hidden sm:inline text-molim-muted">منظور:</span>
        <span className="text-molim-orange font-black">
          {ROLE_NAMES[role]} ({user.name})
        </span>
        <span className="text-[10px] opacity-60">▼</span>
      </button>
    </aside>
  );
}
