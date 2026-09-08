import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon } from "@/components/ui/icons";

/**
 * One integration, folded away until it is wanted.
 *
 * This page held three integrations as three always-open panels, which was fine
 * for three. A store ends up with many — a supplier per catalogue it resells, a
 * processor per payment method a customer might use, and whatever it reports
 * itself to — and at that length an always-open list is a page nobody scrolls to
 * the bottom of.
 *
 * So each one is a disclosure whose summary carries the whole state: what it is
 * called, whether it is configured, and any warning worth seeing without
 * opening it. An owner scans the column of badges, and opens the one that is
 * wrong.
 *
 * A section is open by default only when it is unconfigured. Something with
 * nothing set is something with work outstanding, and it is the one an owner
 * arriving for the first time actually came for; a configured integration has
 * already said everything it needs to in its badge.
 *
 * `<details>` rather than state, so this stays a Server Component and works
 * before — and without — JavaScript.
 */
export type ProviderBadge = {
  label: string;
  tone: "success" | "neutral" | "warning" | "danger" | "accent";
};

export function ProviderSection({
  name,
  summary,
  badges,
  hint,
  actions,
  defaultOpen = false,
  anchorId,
  children,
}: {
  name: string;
  summary: string;
  badges: ProviderBadge[];
  /** A masked key tail or similar, shown under the summary when present. */
  hint?: { label: string; value: string } | null;
  /** Links out of this integration — an import lane, a console. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** DOM id, so deep links like `#g2bulk` land on the right integration. */
  anchorId?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={anchorId}
      open={defaultOpen}
      className="group rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] open:shadow-[var(--shadow-soft)] scroll-mt-24"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-semibold text-[var(--ink)] sm:text-lg">{name}</h3>
            {badges.map((badge) => (
              <Badge key={badge.label} tone={badge.tone}>
                {badge.label}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">{summary}</p>
          {hint ? (
            <p className="mt-2 text-xs text-[var(--ink-faint)]">
              {hint.label}: <span dir="ltr">{hint.value}</span>
            </p>
          ) : null}
        </div>

        <ChevronIcon
          direction="down"
          className="size-5 shrink-0 text-[var(--ink-faint)] transition-transform duration-[var(--duration)] group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-[var(--line)] p-5 sm:p-6">
        {actions ? <div className="mb-6 flex flex-wrap gap-2">{actions}</div> : null}
        {children}
      </div>
    </details>
  );
}

/**
 * A row of integrations that do the same kind of job.
 *
 * Suppliers, payments, and monitoring answer different questions and fail in
 * different ways, and an owner looking for one of them is not looking for the
 * others. The grouping is what keeps the page readable as the list grows.
 */
export function ProviderGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-[0.08em] text-[var(--ink-soft)] uppercase">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}
