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
 *
 * Two shapes share the one component: a `switch` is the pill with both options
 * side by side, and a `toggle` is a single button for the other language — for
 * places too cramped for the pill, like the mobile drawer's footer.
 */
export function LocaleSwitcher({
  locale,
  labels,
  variant = "switch",
}: {
  locale: Locale;
  labels: { switchLabel: string; arabic: string; english: string };
  variant?: "switch" | "toggle";
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

  if (variant === "toggle") {
    const target: Locale = locale === "en" ? "ar" : "en";

    return (
      <Link
        href={hrefFor(target)}
        hrefLang={target}
        lang={target}
        aria-label={labels.switchLabel}
        className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-sm font-medium text-[var(--ink-soft)] transition-colors duration-150 hover:border-[var(--line-strong)] hover:text-[var(--ink)] active:bg-[var(--surface-strong)]"
      >
        <GlobeIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
        <span dir={target === "ar" ? "rtl" : "ltr"}>{localeLabels[target]}</span>
      </Link>
    );
  }

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
