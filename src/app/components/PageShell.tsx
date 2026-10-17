import type { ReactNode } from "react";
import Footer from "./Footer";

type PageShellProps = {
  children: ReactNode;
  narrow?: boolean;
  wide?: boolean;
  showFooter?: boolean;
};

export default function PageShell({
  children,
  narrow = false,
  wide = false,
  showFooter = true,
}: PageShellProps) {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-molim text-[var(--foreground)] overflow-x-hidden"
    >
      <main
        className={`mx-auto w-full px-4 py-6 sm:px-6 ${
          narrow ? "max-w-xl" : wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        {children}
      </main>

      {showFooter ? <Footer /> : null}
    </div>
  );
}
