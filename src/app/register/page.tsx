"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * تم إلغاء التسجيل الذاتي. تُكمل بيانات الأعضاء من داخل /complete-profile
 * بعد إضافتهم من الإدارة وربط حساباتهم.
 */
export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/complete-profile");
  }, [router]);

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-molim text-molim-foreground"
    >
      <p className="text-sm font-bold text-molim-muted">
        جاري تحويلك لإكمال البيانات...
      </p>
    </main>
  );
}
