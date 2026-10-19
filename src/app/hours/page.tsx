"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageShell from "../components/PageShell";

export default function HoursRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tasks");
  }, [router]);

  return (
    <PageShell>
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-center">
        <div className="space-y-3">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-molim border-t-molim-orange" />
          <p className="text-sm font-bold text-molim-muted">
            الساعات التطوعية تابعة للمهام — جاري تحويلك إلى صفحة المهام...
          </p>
        </div>
      </div>
    </PageShell>
  );
}