"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronIcon } from "@/components/ui/icons";

type ProductBreadcrumbProps = {
  locale: string;
  homeLabel: string;
  categorySlug: string;
  categoryName: string;
  productName: string;
};

/**
 * Mobile-friendly back affordance shown above a product/offer.
 *
 * It renders a history-back button (falls back to the product's category when
 * there is no prior history) plus a breadcrumb directory so the user can always
 * return to the category they are browsing: Home / {Category} / {Product}.
 */
export function ProductBreadcrumb({
  locale,
  homeLabel,
  categorySlug,
  categoryName,
  productName,
}: ProductBreadcrumbProps) {
  const router = useRouter();
  const categoryHref = `/${locale}/${categorySlug}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
        aria-label={homeLabel}
      >
        <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
        <span className="max-w-40 truncate">{categoryName}</span>
      </button>

      <nav aria-label={homeLabel} className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <Link
          href={`/${locale}`}
          className="shrink-0 text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          {homeLabel}
        </Link>
        <ChevronIcon direction="end" className="size-3 shrink-0 text-[var(--ink-faint)] rtl:rotate-180" />
        <Link
          href={categoryHref}
          className="shrink-0 text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          {categoryName}
        </Link>
        <ChevronIcon direction="end" className="size-3 shrink-0 text-[var(--ink-faint)] rtl:rotate-180" />
        <span className="truncate text-[var(--ink)]">{productName}</span>
      </nav>
    </div>
  );
}
