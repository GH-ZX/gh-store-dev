"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ImportRemoveButton } from "@/components/admin/import-remove-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowIcon, CheckIcon, SearchIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type AdminMessages } from "@/i18n/messages";
import {
  INITIAL_IMPORT_STATE,
  type ImportActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import { importG2BulkGamesAction } from "@/app/[locale]/dashboard/providers/actions";
import { cn } from "@/lib/cn";
import type { RemoveImportedResult } from "@/lib/services/admin-catalog.service";

/**
 * Provider game picker.
 *
 * The list comes from the server already fetched; this component only handles
 * selection and submits the chosen codes.
 *
 * Games the store already carries start selected and marked. The selection is
 * meant to read as "what this store has", so the picker opens showing the truth
 * rather than an empty set an operator has to rebuild — and re-importing a
 * selected game refreshes its prices rather than duplicating it, which is what
 * submitting an unchanged selection does.
 *
 * Each imported row also carries a removal control, because the mark used to be
 * the end of the story: undoing an import meant finding the game in the catalog
 * list under whatever the store called it.
 */
export type ImportableGame = {
  code: string;
  name: string;
  alreadyImported: boolean;
};

export type G2BulkImportFormProps = {
  locale: Locale;
  messages: AdminMessages["import"];
  providerErrors: AdminMessages["providers"]["g2bulk"]["errors"];
  games: ImportableGame[];
};

export function G2BulkImportForm({
  locale,
  messages,
  providerErrors,
  games,
}: G2BulkImportFormProps) {
  const [state, formAction, pending] = useActionState<ImportActionState, FormData>(
    importG2BulkGamesAction,
    INITIAL_IMPORT_STATE,
  );
  const [query, setQuery] = useState("");
  /*
   * Seeded from what the store already has, not empty. `useState` with an
   * initialiser rather than an effect, so the first paint is already correct.
   */
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(games.filter((game) => game.alreadyImported).map((game) => game.code)),
  );
  const [removal, setRemoval] = useState<RemoveImportedResult | null>(null);

  function onRemoved(result: RemoveImportedResult, code: string): void {
    setRemoval(result);

    if (result.ok) {
      // Nothing left to re-import under that code.
      setSelected((current) => {
        const next = new Set(current);
        next.delete(code);

        return next;
      });
    }
  }

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return games;
    }

    return games.filter(
      (game) =>
        game.name.toLowerCase().includes(term) || game.code.toLowerCase().includes(term),
    );
  }, [games, query]);

  function toggle(code: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }

      return next;
    });
  }

  const error =
    state.error === "no_selection"
      ? messages.noSelectionError
      : state.error
        ? (providerErrors[state.error as keyof typeof providerErrors] ?? providerErrors.unknown)
        : null;

  if (state.summary) {
    const summary = state.summary;

    return (
      <div className="grid gap-6">
        <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
          <h2 className="text-lg font-semibold text-[var(--ink)]">{messages.resultTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
            {formatMessage(
              messages.resultSummary,
              { created: summary.created, updated: summary.updated, failed: summary.failed },
              locale,
            )}
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
            {formatMessage(
              messages.resultOffers,
              { created: summary.offersCreated, updated: summary.offersUpdated },
              locale,
            )}
          </p>

          {summary.outcomes.some((outcome) => outcome.error) ? (
            <ul className="mt-4 grid gap-2">
              {summary.outcomes
                .filter((outcome) => outcome.error)
                .map((outcome) => (
                  <li
                    key={outcome.code}
                    className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
                  >
                    <span dir="ltr">{outcome.code}</span> — {outcome.error}
                  </li>
                ))}
            </ul>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/dashboard/providers`}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
            >
              {messages.backToProviders}
            </Link>
            <Link
              href={`/${locale}/games`}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
            >
              {messages.viewStore}
              <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)] tabular-nums">
          {formatMessage(messages.availableCount, { count: games.length }, locale)}
        </p>
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {formatMessage(messages.selectedCount, { count: selected.size }, locale)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4">
          <SearchIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
          <span className="sr-only">{messages.searchLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={messages.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSelected(new Set(visible.map((game) => game.code)))}
        >
          {messages.selectAll}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
          {messages.clearSelection}
        </Button>
      </div>

      <ul className="grid max-h-[26rem] gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
        {visible.map((game) => {
          const isSelected = selected.has(game.code);

          return (
            <li key={game.code}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-3 transition-colors duration-[var(--duration)]",
                  isSelected
                    ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                    : "border-transparent hover:bg-[var(--shell)]",
                )}
              >
                <input
                  type="checkbox"
                  name="codes"
                  value={game.code}
                  checked={isSelected}
                  onChange={() => toggle(game.code)}
                  className="size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">
                    {game.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
                    {game.code}
                  </span>
                </span>
                {game.alreadyImported ? (
                  <>
                    <Badge tone="neutral" icon={<CheckIcon />}>
                      {messages.alreadyImported}
                    </Badge>
                    <ImportRemoveButton
                      code={game.code}
                      locale={locale}
                      label={messages.removeAction}
                      confirmMessage={messages.removeConfirm}
                      busy={messages.removing}
                      onDone={onRemoved}
                    />
                  </>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
        <input
          type="checkbox"
          name="publish"
          defaultChecked
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--ink)]">{messages.publishLabel}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
            {messages.publishHelp}
          </span>
        </span>
      </label>

      {removal?.ok ? (
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]"
        >
          {formatMessage(messages.removed, { name: removal.name }, locale)}
        </p>
      ) : null}

      {removal && !removal.ok ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {removal.reason === "not_imported" ? messages.removeMissing : messages.removeFailed}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <div>
        <Button
          type="submit"
          size="lg"
          disabled={pending || selected.size === 0}
          trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
        >
          {messages.submitAction}
        </Button>
      </div>
    </form>
  );
}
