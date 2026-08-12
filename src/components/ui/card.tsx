import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Surfaces.
 *
 * {@link Card} is a single glass panel. {@link Bezel} nests a panel inside an
 * outer shell so the pair reads as machined hardware rather than a flat
 * rectangle — the inner radius is deliberately one step smaller than the shell
 * so the curves stay concentric.
 */

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** `flat` removes elevation, for cards inside an already-raised surface. */
  tone?: "raised" | "flat" | "inset";
  interactive?: boolean;
};

const TONE_CLASSES = {
  raised: "bg-[var(--surface)] shadow-[var(--elevation-2)]",
  flat: "bg-[var(--surface)]",
  inset: "bg-[var(--surface-inset)]",
} as const;

export function Card({ className, tone = "raised", interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--line)]",
        TONE_CLASSES[tone],
        interactive &&
          "transition-[border-color,transform,box-shadow] duration-[var(--duration)] ease-[var(--ease-spring)] hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--elevation-3)]",
        className,
      )}
      {...props}
    />
  );
}

export function Bezel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 backdrop-blur-xl",
        className,
      )}
      {...props}
    >
      <div className="gh-sheen overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)] bg-[var(--surface)]">
        {children}
      </div>
    </div>
  );
}
