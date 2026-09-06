import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { AlertIcon, InfoIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Empty, error, and loading states.
 *
 * Every state is a real panel rather than bare text: an empty catalog section is
 * a normal outcome on a new store, and it should look deliberate.
 */

type StateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: { href: string; label: string };
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-[var(--radius-shell)] border border-dashed border-[var(--line-strong)] bg-[var(--shell)] px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] [&>svg]:size-5">
        {icon ?? <InfoIcon />}
      </span>
      <div>
        <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
      </div>
      {action ? (
        <ButtonLink href={action.href} variant="secondary" size="sm">
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

export function ErrorState({ title, description, action, className }: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-[var(--radius-shell)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-6 py-12 text-center",
        className,
      )}
      role="alert"
    >
      <span className="grid size-11 place-items-center rounded-full border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] [&>svg]:size-5">
        <AlertIcon />
      </span>
      <div>
        <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-soft)]">{description}</p>
      </div>
      {action ? (
        <ButtonLink href={action.href} variant="secondary" size="sm">
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

/** Inline notice for a capability that exists in the roadmap but not yet in the UI. */
export function NoticePanel({
  title,
  description,
  badgeLabel,
  className,
}: {
  /** Omit for a standalone note that needs no heading. */
  title?: string;
  description: string;
  badgeLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-5",
        className,
      )}
    >
      {title || badgeLabel ? (
        <div className="mb-2 flex flex-wrap items-center gap-3">
          {title ? <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3> : null}
          {badgeLabel ? <Badge tone="accent">{badgeLabel}</Badge> : null}
        </div>
      ) : null}
      <p className="text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-strong)]", className)}
    />
  );
}

/**
 * Placeholder grid for route-level `loading.tsx` boundaries.
 *
 * Hidden from assistive tech: a navigation is already announced by the browser,
 * and a stack of shimmer boxes adds nothing but noise.
 */
export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-56 rounded-[var(--radius-card)]" />
      ))}
    </div>
  );
}
