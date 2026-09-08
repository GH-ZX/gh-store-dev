"use client";

import { useEffect, useRef, useState, type HTMLAttributes } from "react";
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
 *
 * **Edge fades.** The scrollbar is hidden, so an overflowing rail needs another
 * way to say "there is more off this edge". A mask fades whichever side hides
 * content — and only that side: the state is measured, not assumed, so a short
 * row that fits is rendered hard-edged on both sides exactly like a grid. The
 * measurement is side-aware under RTL, where `scrollLeft` runs the other way.
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

/** Which sides of the rail currently hide content: drives the edge fades. */
type RailEdge = "none" | "start" | "end" | "both";

const EDGE_EPSILON = 4;

export function Rail({ className, itemWidth = "md", label, children, ...props }: RailProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<RailEdge>("none");

  useEffect(() => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    function measure() {
      const list = listRef.current;

      if (!list) {
        return;
      }

      const hidden = list.scrollWidth - list.clientWidth;

      if (hidden <= EDGE_EPSILON) {
        setEdge("none");
        return;
      }

      /*
       * In modern browsers `scrollLeft` runs `0 … hidden` in LTR and
       * `-hidden … 0` in RTL, so the magnitude works for both; the sign is
       * only a legacy-WebKit artefact.
       */
      const position = Math.abs(list.scrollLeft);
      const atStart = position <= EDGE_EPSILON;
      const atEnd = Math.abs(hidden - position) <= EDGE_EPSILON;

      setEdge(atStart && atEnd ? "none" : atStart ? "end" : atEnd ? "start" : "both");
    }

    measure();
    list.addEventListener("scroll", measure, { passive: true });

    // A resize changes how much fits, so the overflow decision has to be remade.
    const observer = new ResizeObserver(measure);
    observer.observe(list);

    return () => {
      list.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <ul
      ref={listRef}
      className={cn("gh-rail gap-4 pb-2", ITEM_WIDTH_CLASSES[itemWidth], className)}
      tabIndex={0}
      role="list"
      aria-label={label}
      data-edge={edge}
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
