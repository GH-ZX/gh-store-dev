"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowIcon, CheckIcon, SearchIcon } from "@/components/ui/icons";
import { StoreImage } from "@/components/store/store-image";
import type { Locale } from "@/i18n/config";
import { formatMessage, type AdminMessages } from "@/i18n/messages";
import {
  INITIAL_MAXSTORE_IMPORT_STATE,
  type MaxStoreImportActionState,
} from "@/app/[locale]/dashboard/providers/maxstore/import/action-state";
import { importMaxStoreAction } from "@/app/[locale]/dashboard/providers/maxstore/import/actions";
import { cn } from "@/lib/cn";
import type { MaxStoreCategory } from "@/lib/services/maxstore-import.service";

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
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(categories.flatMap((category) => category.products.filter((product) => product.alreadyImported).map((product) => product.id))),
  );

  const visibleCategories = useMemo(() => {
    const term = query.trim().toLowerCase();

    return term
      ? categories.filter((category) => category.title.toLowerCase().includes(term))
      : categories;
  }, [categories, query]);
  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ?? visibleCategories[0] ?? categories[0];
  const activeProducts = activeCategory?.products ?? [];
  const selectedCategories = categories.filter((category) =>
    category.products.some((product) => selected.has(product.id)),
  );

  function toggleProduct(id: string): void {
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

  function selectVisibleProducts(): void {
    setSelected((current) => {
      const next = new Set(current);
      activeProducts.forEach((product) => next.add(product.id));
      return next;
    });
  }

  function clearVisibleProducts(): void {
    setSelected((current) => {
      const next = new Set(current);
      activeProducts.forEach((product) => next.delete(product.id));
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
      <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{shared.resultTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {formatMessage(shared.resultSummary, { created: summary.created, updated: summary.updated, failed: summary.failed }, locale)}
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
          {formatMessage(shared.resultOffers, { created: summary.offersCreated, updated: summary.offersUpdated }, locale)}
        </p>
        {summary.outcomes.some((outcome) => outcome.error) ? (
          <ul className="mt-4 grid gap-2">
            {summary.outcomes.filter((outcome) => outcome.error).map((outcome) => (
              <li key={outcome.categoryId} className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]">
                {outcome.name} — {outcome.error}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/${locale}/dashboard/providers`} className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]">
            {shared.backToProviders}
          </Link>
          <Link href={`/${locale}/dashboard/catalog`} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]">
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
      {selectedCategories.map((category) => <input key={category.id} type="hidden" name="categoryIds" value={category.id} />)}
      {[...selected].map((productId) => <input key={productId} type="hidden" name="productIds" value={productId} />)}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)] tabular-nums">
          {formatMessage(messages.categoriesCount, { count: categories.length }, locale)}
        </p>
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {formatMessage(messages.selectedProductsCount, { count: selected.size }, locale)}
        </p>
      </div>

      <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4">
        <SearchIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
        <span className="sr-only">{shared.searchLabel}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={messages.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]" />
      </label>

      <div className="grid gap-4 lg:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)]">
        <nav aria-label={messages.categoriesLabel} className="grid max-h-[32rem] gap-1 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-2">
          {visibleCategories.map((category) => {
            const active = category.id === activeCategory?.id;
            const selectedCount = category.products.filter((product) => selected.has(product.id)).length;

            return (
              <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} className={cn("grid gap-1 rounded-[var(--radius-control)] px-3 py-3 text-start transition-colors duration-[var(--duration)]", active ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-strong)]" : "text-[var(--ink-soft)] hover:bg-[var(--shell)]")}>
                <span className="truncate text-sm font-semibold">{category.title}</span>
                <span className="flex flex-wrap gap-x-2 text-xs text-[var(--ink-faint)] tabular-nums">
                  <span>{category.productCount} {messages.productsLabel}</span>
                  <span>{category.availableCount} {messages.availableLabel}</span>
                  {category.stockCount !== null ? <span>{category.stockCount} {messages.stockLabel}</span> : null}
                  {selectedCount > 0 ? <span className="text-[var(--accent)]">{selectedCount} {messages.selectedLabel}</span> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
          {activeCategory ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-2 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">{activeCategory.title}</h2>
                  <p className="mt-1 text-xs text-[var(--ink-muted)] tabular-nums">
                    {activeCategory.productCount} {messages.productsLabel} · {activeCategory.availableCount} {messages.availableLabel}
                    {activeCategory.stockCount !== null ? ` · ${activeCategory.stockCount} ${messages.stockLabel}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={selectVisibleProducts}>{messages.selectCategory}</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearVisibleProducts}>{messages.clearCategory}</Button>
                </div>
              </div>
              <ul className="grid max-h-[28rem] gap-2 overflow-y-auto">
                {activeProducts.map((product) => {
                  const isSelected = selected.has(product.id);

                  return (
                    <li key={product.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-3 transition-colors duration-[var(--duration)]", isSelected ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-transparent hover:bg-[var(--shell)]")}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleProduct(product.id)} className="size-4 shrink-0 accent-[var(--accent)]" />
                        <span className="size-10 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)]">
                          {/* MaxStore does not document artwork; when a payload carries one, show it. */}
                          <StoreImage src={product.imageUrl} alt="" sizes="40px" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-[var(--ink)]">{product.name}</span>
                            {product.alreadyImported ? <Badge tone="neutral" icon={<CheckIcon />}>{shared.alreadyImported}</Badge> : null}
                            {!product.available ? <Badge tone="neutral">{messages.outOfStock}</Badge> : null}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--ink-faint)] tabular-nums">
                            <span>{product.price.toFixed(2)} USD</span>
                            {product.stockCount !== null ? <span>{product.stockCount} {messages.stockLabel}</span> : null}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : <p className="p-4 text-sm text-[var(--ink-muted)]">{messages.emptyDescription}</p>}
        </section>
      </div>

      <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
        <input type="checkbox" name="publish" defaultChecked className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-medium text-[var(--ink)]">{shared.publishLabel}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">{shared.publishHelp}</span>
        </span>
      </label>

      {error ? <p role="alert" className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]">{error}</p> : null}

      <div>
        <Button type="submit" size="lg" disabled={pending || selected.size === 0} trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}>
          {shared.submitAction}
        </Button>
      </div>
    </form>
  );
}
