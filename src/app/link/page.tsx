"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { linkAccount } from "../lib/supabase/dto";
import { useAuth } from "../lib/auth-context";

export default function LinkPage() {
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleLink() {
    const value = code.trim();

    if (!value) {
      setError("فضلاً أدخل رمز الربط.");
      return;
    }

    setError("");
    setChecking(true);

    const result = await linkAccount(value);

    if (!result.ok) {
      setChecking(false);
      setError(result.error || "تعذر ربط الحساب.");
      return;
    }

    setChecking(false);
    refreshAuth();
    router.replace("/");
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-molim-soft text-molim-foreground"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-16 top-16 h-48 w-48 rotate-12 border-2 border-[#ed542f]/10" />
        <div className="absolute left-[-30px] top-72 h-32 w-32 -rotate-12 border border-[#202124]/10" />
      </div>

      <div className="relative mx-auto max-w-md px-5 pb-14 pt-7">
        <header className="flex items-center justify-between border-b border-[#202124]/10 pb-4">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="شعار مُلم"
              className="h-11 w-11 object-contain rounded-lg"
            />

            <div>
              <p className="text-[11px] text-molim-muted leading-tight">منصة الفريق</p>
              <h1 className="text-lg font-black text-molim-foreground leading-tight">مُلم</h1>
            </div>
          </Link>
        </header>

        <section className="mt-10">
          <p className="text-sm font-bold text-[#ed542f]">ربط الحساب</p>

          <h2 className="mt-2 text-3xl font-black text-molim-foreground">
            ربط حسابك بتيليجرام
          </h2>

          <p className="mt-3 text-sm leading-7 text-molim-muted">
            أدخل رمز الربط الذي زوّدتك به الإدارة لربط حسابك بتيليجرام.
            الرمز يُستخدم مرة واحدة فقط وتنتهي صلاحيته تلقائيًا.
          </p>
        </section>

        <section className="mt-7 border border-molim bg-molim-soft p-5">
          <label
            htmlFor="linkCode"
            className="mb-2 block text-xs font-black text-molim-foreground"
          >
            رمز الربط
          </label>

          <input
            id="linkCode"
            type="text"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleLink();
              }
            }}
            placeholder="مثال: ABCD-EFGH-JKLM"
            autoComplete="off"
            className="h-14 w-full border border-molim bg-molim-surface px-4 text-center text-sm font-bold tracking-wider text-molim-foreground outline-none transition focus:border-[#ed542f] focus:ring-2 focus:ring-[#ed542f]/10"
          />

          {error && (
            <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
          )}

          <button
            type="button"
            onClick={handleLink}
            disabled={checking}
            className="mt-4 h-14 w-full cursor-pointer bg-[#ed542f] text-sm font-black text-white transition hover:bg-[#d94725] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
          >
            {checking ? "جاري الربط..." : "ربط الحساب"}
          </button>
        </section>

        <section className="mt-5 border-r-4 border-[#ed542f] bg-molim-soft px-4 py-3">
          <p className="text-xs font-black text-molim-foreground">ملاحظة</p>

          <p className="mt-1 text-xs leading-6 text-molim-muted">
            إن لم يكن لديك رمز ربط، فهذا يعني أن عضويتك لم تُضف بعد.
            تواصل مع إدارة فريق مُلم.
          </p>
        </section>

        <footer className="mt-10 border-t border-molim pt-5 text-center">
          <p className="text-[10px] text-molim-muted">
            مُلم — ربط الحساب
          </p>
        </footer>
      </div>
    </main>
  );
}
