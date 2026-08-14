"use client";

import { useMemo, useState } from "react";
import { StoreImage } from "@/components/store/store-image";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { formatMessage } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import type { PickCandidate } from "@/lib/services/admin-website.service";

/**
 * The items a handpicked homepage section is pointed at.
 *
 * Order matters and is the order they were ticked in: a "handpicked" row whose
 * order the operator cannot control is a query with extra steps. Ticking
 * appends, unticking removes, and the ticked ones are listed first so a long
 * catalogue never hides what is already chosen.
 *
 * The list is filtered here rather than on the server. Everything is already in
 * the page — one read, capped — so a keystroke should not cost a round trip,
 * and both languages are searched because an operator working in Arabic still
 * knows a game by its English name.
 */
export type SectionPickListProps = {
  candidates: PickCandidate[];
  selected: string[];
  onChange: (ids: string[]) => void;
  locale: Locale;
  max: number;
  messages: AdminMessages["website"]["sections"];
};

function label(candidate: PickCandidate, locale: Locale): string {
  const preferred = locale === "ar" ? candidate.labelAr : candidate.labelEn;

  return preferred || candidate.labelEn || candidate.labelAr;
}

export function SectionPickList({
  candidates,
  selected,
  onChange,
  locale,
  max,
  messages,
}: SectionPickListProps) {
  const [query, setQuery] = useState("");

  const byId = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );

  /*
   * Chosen first, in the order they were chosen, then the rest. A selected id
   * with no candidate behind it — the game was unpublished or deleted after it
   * was picked — is dropped from the display but kept in `selected`, so an
   * unrelated save never silently rewrites the list.
   */
  const rows = useMemo(() => {
    const chosen = selected.flatMap((id) => {
      const candidate = byId.get(id);

      return candidate ? [candidate] : [];
    });
    const chosenIds = new Set(chosen.map((candidate) => candidate.id));
    const rest = candidates.filter((candidate) => !chosenIds.has(candidate.id));
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return [...chosen, ...rest];
    }

    return [...chosen, ...rest].filter((candidate) =>
      [candidate.labelAr, candidate.labelEn, candidate.detail ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [byId, candidates, query, selected]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((current) => current !== id));

      return;
    }

    // Silently dropping the extra one would look like a failed click; the
    // counter above says what the ceiling is and the button stops responding.
    if (selected.length >= max) {
      return;
    }

    onChange([...selected, id]);
  }

  if (candidates.length === 0) {
    return <p className="text-sm leading-6 text-[var(--ink-muted)]">{messages.picksEmpty}</p>;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={messages.picksSearch}
          aria-label={messages.picksSearch}
          className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        />
        <p className="text-xs text-[var(--ink-faint)] tabular-nums">
          {formatMessage(messages.picksCount, { count: selected.length, max }, locale)}
        </p>
      </div>

      <ul
        className="grid max-h-64 gap-1 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-1"
        role="list"
      >
        {rows.map((candidate) => {
          const isSelected = selected.includes(candidate.id);

          return (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => toggle(candidate.id)}
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full min-h-11 items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-start transition-colors duration-[var(--duration)]",
                  isSelected
                    ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
                    : "hover:bg-[var(--surface-strong)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-[4px] border text-[10px] font-bold",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "border-[var(--line-strong)]",
                  )}
                >
                  {isSelected ? "✓" : ""}
                </span>

                {candidate.imageUrl ? (
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-[6px] border border-[var(--line)]">
                    <StoreImage
                      src={candidate.imageUrl}
                      alt=""
                      sizes="2rem"
                      className="absolute inset-0"
                    />
                  </span>
                ) : null}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--ink)]">
                    {label(candidate, locale)}
                  </span>
                  {candidate.detail ? (
                    <span className="block truncate text-xs text-[var(--ink-faint)]">
                      {candidate.detail}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
