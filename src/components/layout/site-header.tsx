import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { Locale } from "@/i18n/config";

const navigation = [
  { href: "", key: "home" },
  { href: "games", key: "games" },
  { href: "gift-cards", key: "giftCards" },
  { href: "sale", key: "offers" },
];

type SiteHeaderProps = {
  locale: Locale;
  labels: Record<"home" | "games" | "giftCards" | "offers" | "menu", string>;
};

export function SiteHeader({ locale, labels }: SiteHeaderProps) {
  return (
    <header className="border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas)_90%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[4.5rem] w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href={`/${locale}`} className="flex shrink-0 items-center gap-3" aria-label={BRAND.name}>
          <span className="grid size-9 place-items-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface-strong)] text-xs font-bold tracking-tight text-[var(--accent)]">
            GS
          </span>
          <span className="text-base font-semibold tracking-tight text-[var(--ink)]">{BRAND.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.key}
              href={`/${locale}/${item.href}`}
              className="rounded-lg px-3 py-2 text-sm text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            >
              {labels[item.key as keyof typeof labels]}
            </Link>
          ))}
        </nav>

        <details className="relative lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-[var(--line)] px-3 text-sm text-[var(--ink-soft)]">
            {labels.menu}
          </summary>
          <nav className="absolute end-0 top-14 z-20 grid min-w-48 gap-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]" aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link key={item.key} href={`/${locale}/${item.href}`} className="rounded-lg px-3 py-3 text-sm text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]">
                {labels[item.key as keyof typeof labels]}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
