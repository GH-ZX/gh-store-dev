import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Horizontal scroll rail.
 *
 * Used for card rows that would otherwise wrap awkwardly on mobile. Native
 * overflow scrolling with scroll-snap keeps it keyboard- and touch-accessible
 * with no JavaScript, and it works in both directions because the browser
 * handles RTL overflow itself.
 *
 * The list carries a tabindex so keyboard users can scroll it, plus a label,
 * per the scrollable-region accessibility pattern.
 */
export type RailProps = HTMLAttributes<HTMLUListElement> & {
  /** Track width per item; `auto` lets items size themselves. */
  itemWidth?: "sm" | "md" | "lg";
  label: string;
};

const ITEM_WIDTH_CLASSES = {
  sm: "[grid-auto-columns:14rem]",
  md: "[grid-auto-columns:17rem]",
  lg: "[grid-auto-columns:21rem]",
} as const;

export function Rail({ className, itemWidth = "md", label, children, ...props }: RailProps) {
  return (
    <ul
      className={cn("gh-rail gap-4 pb-2", ITEM_WIDTH_CLASSES[itemWidth], className)}
      tabIndex={0}
      role="list"
      aria-label={label}
      {...props}
    >
      {children}
    </ul>
  );
}

export function RailItem({ className, children, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li className={cn("gh-rail-item", className)} {...props}>
      {children}
    </li>
  );
}
