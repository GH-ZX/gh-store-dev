"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes } from "react";
import { ArrowIcon } from "@/components/ui/icons";
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
  /** Optional mouse controls; native touch and keyboard scrolling stay available. */
  controls?: { previous: string; next: string };
};

const ITEM_WIDTH_CLASSES = {
  sm: "[grid-auto-columns:14rem]",
  md: "[grid-auto-columns:17rem]",
  lg: "[grid-auto-columns:21rem]",
} as const;

/** Which sides of the rail currently hide content: drives the edge fades. */
type RailEdge = "none" | "start" | "end" | "both";

const EDGE_EPSILON = 4;

export function Rail({ className, itemWidth = "md", label, children, controls, id, ...props }: RailProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<RailEdge>("none");
  const generatedId = useId();
  const listId = id ?? generatedId;

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
      const position = Math.min(hidden, Math.max(0, Math.abs(list.scrollLeft)));
      const atStart = position <= EDGE_EPSILON;
      const atEnd = position >= hidden - EDGE_EPSILON;

      setEdge(atStart && atEnd ? "none" : atStart ? "end" : atEnd ? "start" : "both");
    }

    let rafId: number | null = null;
    function scheduleMeasure() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    }

    scheduleMeasure();
    list.addEventListener("scroll", scheduleMeasure, { passive: true });

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(list);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      list.removeEventListener("scroll", scheduleMeasure);
      observer.disconnect();
    };
  }, [children]);

  function scrollPage(direction: -1 | 1) {
    const list = listRef.current;
    if (!list) return;

    const hidden = Math.max(0, list.scrollWidth - list.clientWidth);
    const current = Math.min(hidden, Math.abs(list.scrollLeft));
    const target = Math.min(hidden, Math.max(0, current + direction * list.clientWidth * 0.85));
    const isRtl = getComputedStyle(list).direction === "rtl";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: isRtl ? -target : target, behavior: reduceMotion ? "auto" : "smooth" });
  }

  const list = (
    <ul
      id={listId}
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

  if (!controls) return list;

  return (
    <div className="sf-rail-with-controls">
      {list}
      <div className="sf-rail-controls" hidden={edge === "none"}>
        <button
          type="button"
          aria-label={controls.previous}
          aria-controls={listId}
          disabled={edge === "end" || edge === "none"}
          onClick={() => scrollPage(-1)}
        >
          <ArrowIcon direction="start" className="size-5 rtl:rotate-180" />
        </button>
        <button
          type="button"
          aria-label={controls.next}
          aria-controls={listId}
          disabled={edge === "start" || edge === "none"}
          onClick={() => scrollPage(1)}
        >
          <ArrowIcon direction="end" className="size-5 rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}

export function RailItem({ className, children, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li className={cn("gh-rail-item", className)} {...props}>
      {children}
    </li>
  );
}
