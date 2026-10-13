"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import MolimHeader from "./MolimHeader";

const PUBLIC_PAGES = [
  "/link",
  "/join",
  "/register",
  "/welcome",
  "/workflow",
  "/structure",
  "/suggestions",
];

function FullScreenLoader({ message }: { message: string }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-molim text-molim-foreground"
    >
      <div className="flex flex-col items-center gap-3 text-molim-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-molim-orange border-t-transparent" />
        <span className="text-sm font-bold">{message}</span>
      </div>
    </div>
  );
}

export default function AppGate({ children }: { children: React.ReactNode }) {
  const { status, isReady, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PAGES.includes(pathname);
  const isLinkPage = pathname === "/link";
  const isCompleteProfilePage = pathname === "/complete-profile";
  const isAccountPage = pathname === "/account";

  useEffect(() => {
    if (status === "needs_linking" && !isLinkPage) {
      router.replace("/link");
      return;
    }

    if (status === "unauthenticated" && !isPublic) {
      router.replace("/join");
      return;
    }

    // العضو «بانتظار الاعتماد» ولم يُكمل ملفه: وجّهه لإكمال الملف أولًا
    // («أكمل بياناتك ليتم اعتماد ملفك»)، قبل حاجز الحساب غير المفعّل.
    if (
      status === "authenticated" &&
      user.status === "pending" &&
      user.profileCompleted === false &&
      !isCompleteProfilePage
    ) {
      router.replace("/complete-profile");
      return;
    }

    // العضو غير النشط (موقوف/منتهٍ/غير مفعّل): سياسة الخادم تمنع كل العمليات
    // الحساسة. نوجّهه لصفحة حسابه فقط (قراءة ذاتية مسموحة) بدل هيكل التطبيق.
    // مدير مخوّل ونشط لا يتأثر فيتمكن من إعادة تفعيل الحساب.
    if (
      status === "authenticated" &&
      user.status !== "active" &&
      !isAccountPage &&
      !(
        isCompleteProfilePage &&
        user.status === "pending" &&
        user.profileCompleted === false
      )
    ) {
      router.replace("/account");
      return;
    }

    if (
      status === "authenticated" &&
      user.status === "active" &&
      user.profileCompleted === false &&
      !isCompleteProfilePage
    ) {
      router.replace("/complete-profile");
    }
  }, [
    status,
    isPublic,
    isLinkPage,
    isCompleteProfilePage,
    isAccountPage,
    user.status,
    user.profileCompleted,
    router,
  ]);

  if (!isReady) {
    return <FullScreenLoader message="جاري التحقق من حسابك..." />;
  }

  if (status === "needs_linking") {
    if (!isLinkPage) {
      return <FullScreenLoader message="جاري تجهيز صفحة الربط..." />;
    }

    return <>{children}</>;
  }

  if (status === "unauthenticated") {
    if (!isPublic) {
      return <FullScreenLoader message="جاري تجهيز صفحتك..." />;
    }

    return <>{children}</>;
  }

  // يُسمح للحساب غير النشط أن يرى صفحة حسابه، أو صفحة إكمال الملف فقط
  // إذا كان «بانتظار الاعتماد» ولم يُكمل ملفه. كل شيء آخر يُحوَّل.
  const pendingIncomplete =
    status === "authenticated" &&
    user.status === "pending" &&
    user.profileCompleted === false;

  const allowedNonActiveScreen = isAccountPage || (isCompleteProfilePage && pendingIncomplete);

  if (
    status === "authenticated" &&
    user.status !== "active" &&
    !allowedNonActiveScreen
  ) {
    return <FullScreenLoader message="حسابك غير مفعّل — جاري تحويلك..." />;
  }

  if (isCompleteProfilePage) {
    return <>{children}</>;
  }

  return (
    <>
      <MolimHeader />
      {children}
    </>
  );
}
