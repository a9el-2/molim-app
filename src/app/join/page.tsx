"use client";

import Link from "next/link";

export default function JoinPage() {
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
            <div className="flex h-11 w-11 items-center justify-center bg-[#ed542f] text-xl font-black text-white">
              م
            </div>

            <div>
              <p className="text-[11px] text-molim-muted">منصة الفريق</p>
              <h1 className="text-lg font-black text-molim-foreground">مُلم</h1>
            </div>
          </Link>
        </header>

        <section className="mt-10">
          <p className="text-sm font-bold text-[#ed542f]">الدخول إلى المنصة</p>

          <h2 className="mt-2 text-3xl font-black text-molim-foreground">
            العضوية تُضاف من الإدارة
          </h2>

          <p className="mt-3 text-sm leading-7 text-molim-muted">
            تم إلغاء نظام دعوات الانضمام. تُضاف العضويات الآن من قِبل
            الإدارة أو الموارد البشرية، ثم يُزوَّد العضو برمز ربط آمن
            لمرة واحدة لإكمال دخوله.
          </p>
        </section>

        <section className="mt-7 border-r-4 border-[#ed542f] bg-molim-soft px-4 py-4">
          <p className="text-xs font-black text-molim-foreground">
            كيف أدخل؟
          </p>

          <p className="mt-2 text-xs leading-6 text-molim-muted">
            افتح التطبيق من داخل تيليجرام. إن كانت عضويتك مضافة فسيعمل
            دخولك مباشرة أو تُطلب منك بيانات الربط. وإن لم تُضف بعد،
            تواصل مع إدارة فريق مُلم.
          </p>
        </section>

        <Link
          href="/link"
          className="mt-6 flex h-14 w-full items-center justify-center bg-[#ed542f] text-sm font-black text-white transition hover:opacity-90"
        >
          ربط حسابي برمز الربط
        </Link>

        <footer className="mt-10 border-t border-molim pt-5 text-center">
          <p className="text-[10px] text-molim-muted">مُلم — الانضمام للفريق</p>
        </footer>
      </div>
    </main>
  );
}
