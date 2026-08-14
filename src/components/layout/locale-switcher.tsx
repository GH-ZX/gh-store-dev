"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GlobeIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";

/**
 * Language switch.
 *
 * Swaps only the locale segment so the visitor stays on the page they are
 * reading, query string included. Rendered as a real link, so it works without
 * JavaScript and is crawlable.
 *
 * One shape fits every place it appears: a single globe button that toggles to
 * the other language. The name of the other language lives in the accessible
 * label rather than on the button, so the row it sits in — header bar, drawer
 * footer — stays icon-for-icon beside its neighbours instead of mixing icons
 * and words.
 */
export function LocaleSwitcher({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { switchLabel: string };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const target: Locale = locale === "en" ? "ar" : "en";

  function hrefFor(targetLocale: Locale): string {
    const segments = (pathname ?? `/${locale}`).split("/");
    // segments[0] is the empty string before the leading slash.
    segments[1] = targetLocale;
    const query = searchParams?.toString();

    return `${segments.join("/") || `/${targetLocale}`}${query ? `?${query}` : ""}`;
  }

  return (
    <Link
      href={hrefFor(target)}
      hrefLang={target}
      lang={target}
      aria-label={labels.switchLabel}
      title={labels.switchLabel}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
    >
      <GlobeIcon className="size-[1.125rem] shrink-0" />
    </Link>
  );
}
