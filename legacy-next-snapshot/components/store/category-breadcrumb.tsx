import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";

type CategoryBreadcrumbProps = {
  locale: string;
  homeLabel: string;
  productsHref: string;
  productsLabel: string;
  categoryName: string;
  navLabel: string;
};

/**
 * Directory trail shown at the top of a category listing: Home / All products /
 * {Category}. The current category is the last, highlighted segment; "All
 * products" hops back to the universal catalog.
 */
export function CategoryBreadcrumb({
  locale,
  homeLabel,
  productsHref,
  productsLabel,
  categoryName,
  navLabel,
}: CategoryBreadcrumbProps) {
  return (
    <nav aria-label={navLabel} className="flex flex-wrap items-center gap-1.5 text-sm">
      <Link
        href={`/${locale}`}
        className="shrink-0 text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
      >
        {homeLabel}
      </Link>
      <ChevronIcon direction="end" className="size-3 shrink-0 text-[var(--ink-faint)] rtl:rotate-180" />
      <Link
        href={productsHref}
        className="shrink-0 text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
      >
        {productsLabel}
      </Link>
      <ChevronIcon direction="end" className="size-3 shrink-0 text-[var(--ink-faint)] rtl:rotate-180" />
      <span className="truncate font-semibold text-[var(--ink)]">{categoryName}</span>
    </nav>
  );
}
