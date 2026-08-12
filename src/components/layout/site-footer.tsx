import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-[var(--ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link href="/" className="font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]">
          {BRAND.name}
        </Link>
        <p>Digital goods, delivered with clarity.</p>
      </div>
    </footer>
  );
}
