import Link from "next/link";
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
  tight: "py-8 sm:py-10",
  normal: "py-12 sm:py-16",
  page: "pt-10 pb-14 sm:pt-14 sm:pb-20",
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
  h1: "text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.05] font-semibold tracking-[-0.035em]",
  h2: "text-[clamp(1.5rem,3.4vw,2.25rem)] leading-[1.15] font-semibold tracking-[-0.03em]",
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
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "sm:mx-auto")}>
        {eyebrow ? <Eyebrow className="mb-4">{eyebrow}</Eyebrow> : null}
        <Heading className={cn(TITLE_CLASSES[as], "text-[var(--ink)]")}>{title}</Heading>
        {subtitle ? (
          <p className="mt-4 text-base leading-7 text-[var(--ink-soft)]">{subtitle}</p>
        ) : null}
      </div>

      {viewAllHref || actions ? (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {viewAllHref && viewAllLabel ? (
            <Link
              href={viewAllHref}
              className="group inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
            >
              {viewAllLabel}
              <span className="grid size-6 place-items-center rounded-full bg-[var(--shell)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
