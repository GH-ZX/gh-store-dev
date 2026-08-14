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
  INITIAL_MAXSTORE_IMPORT_STATE,
  type MaxStoreImportActionState,
} from "@/app/[locale]/dashboard/providers/maxstore/import/action-state";
import { importMaxStoreAction } from "@/app/[locale]/dashboard/providers/maxstore/import/actions";
import { cn } from "@/lib/cn";
import type { MaxStoreCategory } from "@/lib/services/maxstore-import.service";
import type { RemoveImportedResult } from "@/lib/services/admin-catalog.service";

/**
 * MaxStore category picker.
 *
 * Categories rather than individual products: MaxStore's catalogue runs to
 * whole sections — game top-ups, numbers, social media, support apps, recharge
 * accounts — and an owner decides in those units, not one product at a time.
 * Each imported category becomes a container in the catalog with its products
 * as packages underneath.
 *
 * Behaves like the G2Bulk pickers on purpose, down to opening on what the store
 * already carries and offering removal on each imported row.
 */
export type MaxStoreImportFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["maxstoreImport"];
  shared: AdminMessages["import"];
  providerErrors: AdminMessages["providers"]["g2bulk"]["errors"];
  categories: MaxStoreCategory[];
};

export function MaxStoreImportForm({
  locale,
  messages,
  shared,
  providerErrors,
  categories,
}: MaxStoreImportFormProps) {
  const [state, formAction, pending] = useActionState<MaxStoreImportActionState, FormData>(
    importMaxStoreAction,
    INITIAL_MAXSTORE_IMPORT_STATE,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(categories.filter((category) => category.alreadyImported).map((c) => c.id)),
  );
  const [removal, setRemoval] = useState<RemoveImportedResult | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return term
      ? categories.filter((category) => category.title.toLowerCase().includes(term))
      : categories;
  }, [categories, query]);

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function onRemoved(result: RemoveImportedResult, code: string): void {
    setRemoval(result);

    if (!result.ok) {
      return;
    }

    const removed = categories.find((category) => category.providerCode === code);

    if (removed) {
      setSelected((current) => {
        const next = new Set(current);
        next.delete(removed.id);

        return next;
      });
    }
  }

  const error =
    state.error === "no_selection"
      ? shared.noSelectionError
      : state.error
        ? (providerErrors[state.error as keyof typeof providerErrors] ?? providerErrors.unknown)
        : null;

  if (state.summary) {
    const summary = state.summary;

    return (
      <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{shared.resultTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {formatMessage(
            shared.resultSummary,
            { created: summary.created, updated: summary.updated, failed: summary.failed },
            locale,
          )}
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
          {formatMessage(
            shared.resultOffers,
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
                  key={outcome.categoryId}
                  className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
                >
                  {outcome.name} — {outcome.error}
                </li>
              ))}
          </ul>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${locale}/dashboard/providers`}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
          >
            {shared.backToProviders}
          </Link>
          <Link
            href={`/${locale}/dashboard/catalog`}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
          >
            {messages.viewCatalog}
            <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)] tabular-nums">
          {formatMessage(shared.availableCount, { count: categories.length }, locale)}
        </p>
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {formatMessage(shared.selectedCount, { count: selected.size }, locale)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4">
          <SearchIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
          <span className="sr-only">{shared.searchLabel}</span>
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
          onClick={() => setSelected(new Set(visible.map((category) => category.id)))}
        >
          {shared.selectAll}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
          {shared.clearSelection}
        </Button>
      </div>

      <ul className="grid max-h-[26rem] gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
        {visible.map((category) => {
          const isSelected = selected.has(category.id);

          return (
            <li key={category.id}>
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
                  name="categoryIds"
                  value={category.id}
                  checked={isSelected}
                  onChange={() => toggle(category.id)}
                  className="size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">
                    {category.title}
                  </span>
                  <span className="block text-xs text-[var(--ink-faint)] tabular-nums">
                    {formatMessage(
                      messages.productsCount,
                      { count: category.productCount, available: category.availableCount },
                      locale,
                    )}
                  </span>
                </span>
                {category.alreadyImported ? (
                  <>
                    <Badge tone="neutral" icon={<CheckIcon />}>
                      {shared.alreadyImported}
                    </Badge>
                    <ImportRemoveButton
                      code={category.providerCode}
                      locale={locale}
                      label={shared.removeAction}
                      confirmMessage={shared.removeConfirm}
                      busy={shared.removing}
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
          <span className="block text-sm font-medium text-[var(--ink)]">{shared.publishLabel}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
            {shared.publishHelp}
          </span>
        </span>
      </label>

      {removal?.ok ? (
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]"
        >
          {formatMessage(shared.removed, { name: removal.name }, locale)}
        </p>
      ) : null}

      {removal && !removal.ok ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {removal.reason === "not_imported" ? shared.removeMissing : shared.removeFailed}
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
          {shared.submitAction}
        </Button>
      </div>
    </form>
  );
}
