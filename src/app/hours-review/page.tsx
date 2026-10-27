"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageShell from "../components/PageShell";

export default function HoursReviewRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/work");
  }, [router]);

  return (
    <PageShell>
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-center">
        <div className="space-y-3">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-molim border-t-molim-orange" />
          <p className="text-sm font-bold text-molim-muted">
            جاري تحويلك إلى صفحة «المهام والعمل»...
          </p>
        </div>
      </div>
    </PageShell>
  );
}
