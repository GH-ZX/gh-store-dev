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
  INITIAL_VOUCHER_IMPORT_STATE,
  type VoucherImportActionState,
} from "@/app/[locale]/dashboard/providers/g2bulk/vouchers/action-state";
import { importG2BulkVouchersAction } from "@/app/[locale]/dashboard/providers/g2bulk/vouchers/actions";
import { cn } from "@/lib/cn";
import type { RemoveImportedResult } from "@/lib/services/admin-catalog.service";

/**
 * Provider voucher-category picker.
 *
 * The list arrives already fetched from the server, so the API key stays there.
 * Each category is imported as one storefront group holding its cards; a category
 * already mapped to the store is marked, because re-importing it refreshes prices
 * and stock rather than duplicating it. A category the supplier has nothing in
 * stock for is labelled too — those cards import dormant, since they cannot be
 * delivered.
 */
export type ImportableVoucherCategory = {
  id: number;
  title: string;
  productCount: number;
  hasStock: boolean;
  alreadyImported: boolean;
  /** The code the mapping is stored under, so removal needs no second lookup. */
  providerCode: string;
};

export type G2BulkVoucherImportFormProps = {
  locale: Locale;
  messages: AdminMessages["vouchers"];
  /** Shared import copy (search, selection, result heading). */
  shared: AdminMessages["import"];
  providerErrors: AdminMessages["providers"]["g2bulk"]["errors"];
  categories: ImportableVoucherCategory[];
};

export function G2BulkVoucherImportForm({
  locale,
  messages,
  shared,
  providerErrors,
  categories,
}: G2BulkVoucherImportFormProps) {
  const [state, formAction, pending] = useActionState<VoucherImportActionState, FormData>(
    importG2BulkVouchersAction,
    INITIAL_VOUCHER_IMPORT_STATE,
  );
  const [query, setQuery] = useState("");
  // Seeded from what the store already carries, so the picker opens on the truth.
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        categories.filter((category) => category.alreadyImported).map((category) => category.id),
      ),
  );
  const [removal, setRemoval] = useState<RemoveImportedResult | null>(null);

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

  const totalProducts = useMemo(
    () => categories.reduce((total, category) => total + category.productCount, 0),
    [categories],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return categories;
    }

    return categories.filter((category) => category.title.toLowerCase().includes(term));
  }, [categories, query]);

  function toggle(id: number) {
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

  const error =
    state.error === "no_selection"
      ? shared.noSelectionError
      : state.error
        ? (providerErrors[state.error as keyof typeof providerErrors] ?? providerErrors.unknown)
        : null;

  if (state.summary) {
    const summary = state.summary;

    return (
      <div className="grid gap-6">
        <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
          <h2 className="text-lg font-semibold text-[var(--ink)]">{shared.resultTitle}</h2>
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
              {messages.backToProviders}
            </Link>
            <Link
              href={`/${locale}/gift-cards`}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
            >
              {shared.viewStore}
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
          {formatMessage(messages.productsCount, { count: totalProducts }, locale)}
        </p>
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {formatMessage(messages.selectedCount, { count: selected.size }, locale)}
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
            placeholder={shared.searchPlaceholder}
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

      <fieldset className="grid gap-2">
        <legend className="sr-only">{messages.categoryLabel}</legend>

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
                        { count: category.productCount },
                        locale,
                      )}
                    </span>
                  </span>
                  <Badge tone={category.hasStock ? "success" : "warning"}>
                    {category.hasStock ? messages.inStock : messages.outOfStock}
                  </Badge>
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
      </fieldset>

      <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
        <input
          type="checkbox"
          name="publish"
          defaultChecked
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--ink)]">
            {messages.publishLabel}
          </span>
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
          {messages.submitAction}
        </Button>
      </div>
    </form>
  );
}
