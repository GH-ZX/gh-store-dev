import Link from "next/link";
import type { Locale } from "@/i18n/config";
import {
  LOG_LEVEL_FILTERS,
  LOG_VIEWS,
  logHref,
  type LogLevelFilter,
  type LogView,
} from "@/lib/logging/log-view";

/**
 * The Logs page's two switches: which log, and how much of it.
 *
 * Both are lists of links rather than controls, so the page needs no client
 * JavaScript and a particular view can be sent to someone else as a URL. That is
 * the same reason the locale switcher is built from links — but unlike that one,
 * these need no `"use client"`: the current view is already known on the server,
 * so there is nothing to read from the browser.
 */

const GROUP = "flex w-fit items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--line)] p-0.5";
const ACTIVE =
  "rounded-[var(--radius-pill)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]";
const IDLE =
  "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]";

export function LogTabs({
  locale,
  view,
  level,
  labels,
}: {
  locale: Locale;
  view: LogView;
  level: LogLevelFilter;
  labels: { groupLabel: string } & Record<LogView, string>;
}) {
  return (
    <div className={GROUP} role="group" aria-label={labels.groupLabel}>
      {LOG_VIEWS.map((candidate) => {
        const isActive = candidate === view;

        return (
          <Link
            key={candidate}
            /*
             * The page number is deliberately not carried across. Page 3 of the
             * audit log says nothing about where to open the provider runs.
             */
            href={logHref({ locale, view: candidate, level })}
            aria-current={isActive ? "true" : undefined}
            className={isActive ? ACTIVE : IDLE}
          >
            {labels[candidate]}
          </Link>
        );
      })}
    </div>
  );
}

export function LogLevelTabs({
  locale,
  level,
  labels,
}: {
  locale: Locale;
  level: LogLevelFilter;
  labels: { groupLabel: string } & Record<LogLevelFilter, string>;
}) {
  return (
    <div className={GROUP} role="group" aria-label={labels.groupLabel}>
      {LOG_LEVEL_FILTERS.map((candidate) => {
        const isActive = candidate === level;

        return (
          <Link
            key={candidate}
            href={logHref({ locale, view: "events", level: candidate })}
            aria-current={isActive ? "true" : undefined}
            className={isActive ? ACTIVE : IDLE}
          >
            {labels[candidate]}
          </Link>
        );
      })}
    </div>
  );
}
