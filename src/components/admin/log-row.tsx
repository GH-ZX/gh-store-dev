import type { ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * One line of a log, with its detail folded away.
 *
 * A log is read by scanning, not by reading: what an operator does is run an eye
 * down the level and the event name looking for the one row that matters, and
 * every open JSON blob between the rows makes that scan longer. So the row is a
 * single line until asked otherwise.
 *
 * Built on `<details>` rather than state, which is what keeps the whole Logs page
 * a server component — it expands with JavaScript switched off, and there is no
 * hydration cost for a list nobody may click.
 */

const ROW = "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]";
const LINE = "flex items-center gap-3 px-4 py-2.5";

export function LogRow({
  summary,
  detail,
  expandLabel,
}: {
  summary: ReactNode;
  /** Omitted when the row has nothing more to say, which is not an empty panel. */
  detail?: ReactNode;
  expandLabel: string;
}) {
  /*
   * A row with no detail is not a `<details>` that opens onto nothing. It keeps
   * the chevron's width as empty space so the rows either side still line up.
   */
  if (!detail) {
    return (
      <li className={ROW}>
        <div className={LINE}>
          <div className="min-w-0 flex-1">{summary}</div>
          <span className="size-4 shrink-0" aria-hidden="true" />
        </div>
      </li>
    );
  }

  return (
    <li>
      <details
        className={cn(
          ROW,
          "group transition-colors duration-[var(--duration)] open:bg-[var(--surface-strong)] hover:border-[var(--line-strong)]",
        )}
      >
        <summary
          className={cn(
            LINE,
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          <div className="min-w-0 flex-1">{summary}</div>
          <ChevronIcon
            direction="down"
            className="size-4 shrink-0 text-[var(--ink-faint)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-open:rotate-180"
          />
          <span className="sr-only">{expandLabel}</span>
        </summary>

        <div className="border-t border-[var(--line)] px-4 py-3">{detail}</div>
      </details>
    </li>
  );
}

/**
 * The machine detail of an event.
 *
 * Always `dir="ltr"`: it is JSON, and mirroring it in Arabic would put the
 * braces on the wrong ends of the lines.
 */
export function LogJson({ value }: { value: unknown }) {
  return (
    <pre
      className="overflow-x-auto font-mono text-[0.6875rem] leading-5 text-[var(--ink-muted)]"
      dir="ltr"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** The timestamp as it appears on every row: minute precision, never mirrored. */
export function LogTime({ value }: { value: string }) {
  return (
    <time
      className="shrink-0 text-xs text-[var(--ink-faint)] tabular-nums"
      dateTime={value || undefined}
      dir="ltr"
    >
      {value.slice(0, 16).replace("T", " ")}
    </time>
  );
}
