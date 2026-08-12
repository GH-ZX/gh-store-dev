import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small status pills. Tone carries meaning, so it never encodes it in colour alone — always pair with text. */
export type BadgeTone = "neutral" | "accent" | "sale" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-[var(--line)] bg-[var(--shell)] text-[var(--ink-soft)]",
  accent:
    "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent-strong)]",
  sale: "border-[color-mix(in_srgb,var(--accent-3)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-3)_16%,transparent)] text-[var(--accent-3)]",
  success:
    "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
  warning:
    "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] text-[var(--danger)]",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  icon?: ReactNode;
};

export function Badge({ className, tone = "neutral", icon, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs font-semibold [&>svg]:size-3.5",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

/** Microscopic uppercase label that precedes a section or page heading. */
export function Eyebrow({ className, children, icon, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--shell)] px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-[var(--ink-soft)] uppercase [&>svg]:size-3.5 [&>svg]:text-[var(--accent)]",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
