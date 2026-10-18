"use client";

import Link from "next/link";
import { useAuth } from "../lib/auth-context";

export default function Footer() {
  const { user } = useAuth();

  return (
    <footer className="molim-footer mt-10">
      <div className="mx-auto max-w-6xl px-4 py-7 text-center sm:px-6">
        <p className="text-sm font-bold">
          فريق مُلم التطوعي
        </p>

        <p className="mt-2 text-xs opacity-70">
          نعمل معًا لصناعة أثر مستدام.
        </p>



        <p className="mt-5 border-t border-white/10 pt-4 text-[10px] opacity-50">
          مُلم © 2026
        </p>
      </div>
    </footer>
  );
}