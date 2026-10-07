import { Link } from "react-router";
import type { HTMLAttributes, ReactNode } from "react";
import { ArrowIcon } from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/**
 * Page and section scaffolding.
 *
 * All storefront content sits inside {@link Section} so the page gutter and max
 * width come from one place. {@link SectionHeader} carries the eyebrow, heading,
 * optional subtitle, and the "view all" affordance.
 */

export type SectionProps = HTMLAttributes<HTMLElement> & {
  /** `tight` for stacked sections, `page` for the first section of a page. */
  spacing?: "tight" | "normal" | "page";
  /** Renders the ambient mesh backdrop behind the section. */
  mesh?: boolean;
};

const SPACING_CLASSES = {
  tight: "py-5 sm:py-7",
  normal: "py-7 sm:py-10",
  page: "pt-6 pb-8 sm:pt-10 sm:pb-12",
} as const;

export function Section({
  className,
  spacing = "normal",
  mesh = false,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn("relative", SPACING_CLASSES[spacing], className)} {...props}>
      {mesh ? <div className="gh-mesh" aria-hidden="true" /> : null}
      <div className="gh-page relative">{children}</div>
    </section>
  );
}

/** Section body that spans the full viewport width, for edge-to-edge rails. */
export function SectionBleed({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative", className)} {...props}>
      {children}
    </div>
  );
}

export type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Localized href for the "view all" link; omit to hide it. */
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Rendered at the end of the header row, e.g. rail controls. */
  actions?: ReactNode;
  as?: "h1" | "h2";
  align?: "start" | "center";
  className?: string;
};

const TITLE_CLASSES = {
  h1: "text-[clamp(2rem,5vw,3.25rem)] leading-[1.08] font-bold tracking-[-0.03em]",
  h2: "text-[clamp(1.375rem,2.6vw,1.875rem)] leading-[1.2] font-semibold tracking-[-0.022em]",
} as const;

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  actions,
  as = "h2",
  align = "start",
  className,
}: SectionHeaderProps) {
  const Heading = as;

  return (
    <div
      className={cn(
        "flex flex-row flex-wrap items-end justify-between gap-x-5 gap-y-3",
        align === "center" && "flex-col sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "sm:mx-auto")}>
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <Heading className={cn(TITLE_CLASSES[as], "text-[var(--ink)]")}>{title}</Heading>
        {subtitle ? (
          <p className="mt-1.5 text-[15px] leading-6 text-[var(--ink-muted)]">{subtitle}</p>
        ) : null}
      </div>

      {viewAllHref || actions ? (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {viewAllHref && viewAllLabel ? (
            <Link
              to={viewAllHref}
              aria-label={title ? `${viewAllLabel} — ${title}` : viewAllLabel}
              className="group inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-[var(--accent)] transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
            >
              {viewAllLabel}
              <ArrowIcon direction="end" className="size-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
