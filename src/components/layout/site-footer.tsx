import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { Locale } from "@/i18n/config";

type SiteFooterProps = {
  locale: Locale;
  labels: { tagline: string };
};

export function SiteFooter({ locale, labels }: SiteFooterProps) {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-[var(--ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link href={`/${locale}`} className="font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]">
          {BRAND.name}
        </Link>
        <p>{labels.tagline}</p>
      </div>
    </footer>
  );
}
