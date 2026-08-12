"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GlobeIcon } from "@/components/ui/icons";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/config";

/**
 * Language switch.
 *
 * Swaps only the locale segment so the visitor stays on the page they are
 * reading, query string included. Rendered as real links, so it works without
 * JavaScript and is crawlable.
 */
export function LocaleSwitcher({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { switchLabel: string; arabic: string; english: string };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(target: Locale): string {
    const segments = (pathname ?? `/${locale}`).split("/");
    // segments[0] is the empty string before the leading slash.
    segments[1] = target;
    const query = searchParams?.toString();

    return `${segments.join("/") || `/${target}`}${query ? `?${query}` : ""}`;
  }

  const localeLabels: Record<Locale, string> = {
    ar: labels.arabic,
    en: labels.english,
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--line)] p-0.5"
      role="group"
      aria-label={labels.switchLabel}
    >
      <GlobeIcon className="mx-1.5 size-4 shrink-0 text-[var(--ink-muted)]" />
      {SUPPORTED_LOCALES.map((supported) => {
        const isActive = supported === locale;

        return (
          <Link
            key={supported}
            href={hrefFor(supported)}
            hrefLang={supported}
            aria-current={isActive ? "true" : undefined}
            className={
              isActive
                ? "rounded-[var(--radius-pill)] bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]"
                : "rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
            }
          >
            {supported === "ar" ? "ع" : "EN"}
            <span className="sr-only"> {localeLabels[supported]}</span>
          </Link>
        );
      })}
    </div>
  );
}
