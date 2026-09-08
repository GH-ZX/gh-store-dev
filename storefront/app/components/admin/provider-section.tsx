import type { ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

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
  hint?: { label: string; value: string } | null;
  actions?: ReactNode;
  defaultOpen?: boolean;
  anchorId?: string;
  children: ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    success: "admin-badge admin-badge-success",
    danger: "admin-badge admin-badge-danger",
    warning: "admin-badge admin-badge-warning",
    accent: "admin-badge admin-badge-accent",
    neutral: "admin-badge admin-badge-neutral",
  };

  return (
    <details
      id={anchorId}
      open={defaultOpen}
      className="group rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] open:shadow-[var(--elevation-2)] transition-shadow duration-150 scroll-mt-24 overflow-hidden"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 sm:p-5 hover:bg-[var(--surface-strong)] transition-colors select-none">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-[var(--ink)] sm:text-lg">{name}</h3>
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={toneClasses[badge.tone] ?? "admin-badge admin-badge-neutral"}
              >
                {badge.label}
              </span>
            ))}
          </div>
          <p className="mt-1 max-w-xl text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed">
            {summary}
          </p>
          {hint ? (
            <p className="mt-1.5 text-xs text-[var(--ink-faint)] font-mono">
              {hint.label}: <span dir="ltr">{hint.value}</span>
            </p>
          ) : null}
        </div>

        <ChevronIcon
          direction="down"
          className="size-5 shrink-0 text-[var(--ink-muted)] transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-[var(--line)] p-4 sm:p-6 bg-[var(--surface-inset)]/30 space-y-4">
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        {children}
      </div>
    </details>
  );
}

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
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-bold tracking-wider text-[var(--ink-muted)] uppercase">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
