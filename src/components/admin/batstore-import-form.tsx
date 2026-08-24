"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ImportRemoveButton } from "@/components/admin/import-remove-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowIcon, CheckIcon, SearchIcon } from "@/components/ui/icons";
import { StoreImage } from "@/components/store/store-image";
import type { Locale } from "@/i18n/config";
import { formatMessage, type AdminMessages } from "@/i18n/messages";
import {
  INITIAL_BATSTORE_IMPORT_STATE,
  type BatStoreImportActionState,
} from "@/app/[locale]/dashboard/providers/batstore/import/action-state";
import { importBatStoreAction } from "@/app/[locale]/dashboard/providers/batstore/import/actions";
import { cn } from "@/lib/cn";
import type {
  AdminCategory,
  RemoveImportedResult,
} from "@/lib/services/admin-catalog.service";
import type { BatStoreImportableProduct } from "@/lib/services/batstore-import.service";
import { BATSTORE_PROVIDER_NAME } from "@/providers/batstore/mapping";

/**
 * BatStore product picker.
 *
 * Products rather than categories: BatStore's catalogue is flat — a game top-up,
 * an account, an email — with nothing to group by, so an owner decides one
 * product at a time. Each row carries the store category to drop the product
 * into, because a flat supplier cannot say where it belongs. Each imported
 * product becomes a container in the catalog with a single offer underneath.
 *
 * Behaves like the other pickers on purpose, down to opening on what the store
 * already carries and offering removal on each imported row.
 */
export type BatStoreImportFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["batstoreImport"];
  shared: AdminMessages["import"];
  providerErrors: AdminMessages["providers"]["g2bulk"]["errors"];
  products: BatStoreImportableProduct[];
  categories: AdminCategory[];
};

export function BatStoreImportForm({
  locale,
  messages,
  shared,
  providerErrors,
  products,
  categories,
}: BatStoreImportFormProps) {
  const [state, formAction, pending] = useActionState<BatStoreImportActionState, FormData>(
    importBatStoreAction,
    INITIAL_BATSTORE_IMPORT_STATE,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(products.filter((product) => product.alreadyImported).map((p) => p.id)),
  );
  const [removal, setRemoval] = useState<RemoveImportedResult | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return term
      ? products.filter((product) => product.name.toLowerCase().includes(term))
      : products;
  }, [products, query]);

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

    const removed = products.find((product) => product.providerCode === code);

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

        {summary.outcomes.some((outcome) => outcome.error) ? (
          <ul className="mt-4 grid gap-2">
            {summary.outcomes
              .filter((outcome) => outcome.error)
              .map((outcome) => (
                <li
                  key={outcome.productId}
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
          {formatMessage(shared.availableCount, { count: products.length }, locale)}
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
          onClick={() => setSelected(new Set(visible.map((product) => product.id)))}
        >
          {shared.selectAll}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
          {shared.clearSelection}
        </Button>
      </div>

      <ul className="grid max-h-[26rem] gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
        {visible.map((product) => {
          const isSelected = selected.has(product.id);

          return (
            <li key={product.id}>
              <div
                className={cn(
                  "rounded-[var(--radius-control)] border transition-colors duration-[var(--duration)]",
                  isSelected
                    ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                    : "border-transparent hover:bg-[var(--shell)]",
                )}
              >
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    name="productIds"
                    value={product.id}
                    checked={isSelected}
                    onChange={() => toggle(product.id)}
                    className="size-4 shrink-0 accent-[var(--accent)]"
                  />
                  {/*
                   * Supplier artwork, when the product carries one. Seeing the
                   * picture beside the name is how an operator notices a test
                   * product or a wrong import before it reaches customers.
                   */}
                  <span className="size-10 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)]">
                    <StoreImage src={product.imageUrl} alt="" sizes="40px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block truncate text-sm font-medium text-[var(--ink)]">
                        {product.name}
                      </span>
                      {product.isTest ? <Badge tone="neutral">{messages.testProduct}</Badge> : null}
                      {!product.available ? (
                        <Badge tone="neutral">{messages.noStock}</Badge>
                      ) : null}
                    </span>
                    <span className="block text-xs text-[var(--ink-faint)] tabular-nums">
                      {formatMessage("{price}", { price: product.priceUsd.toFixed(2) }, locale)} USD
                    </span>
                  </span>
                  {product.alreadyImported ? (
                    <>
                      <Badge tone="neutral" icon={<CheckIcon />}>
                        {shared.alreadyImported}
                      </Badge>
                      <ImportRemoveButton
                        code={product.providerCode}
                        provider={BATSTORE_PROVIDER_NAME}
                        locale={locale}
                        label={shared.removeAction}
                        confirmMessage={shared.removeConfirm}
                        busy={shared.removing}
                        onDone={onRemoved}
                      />
                    </>
                  ) : null}
                </label>
                <div className="flex items-center gap-3 px-4 pb-3 ps-[calc(2.5rem)]">
                  <label className="grid min-w-0 flex-1 gap-1">
                    <span className="text-xs font-medium text-[var(--ink-faint)]">
                      {messages.categoryLabel}
                    </span>
                    <select
                      name={`category-${product.id}`}
                      defaultValue={product.categoryId ?? ""}
                      className="min-h-9 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                    >
                      <option value="">{messages.categoryNone}</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.nameAr} / {category.nameEn}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
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