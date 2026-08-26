"use client";

import { useActionState, useMemo, useState } from "react";
import { ImportRemoveButton } from "@/components/admin/import-remove-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowIcon, CheckIcon, SearchIcon, SyncIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import type { AdminCategory, RemoveImportedResult } from "@/lib/services/admin-catalog.service";
import type { ImportActionState, ImportItem, ImportLane } from "@/lib/import/types";

export type UniversalImportFormProps = {
  locale: Locale;
  messages: AdminMessages["import"];
  providerErrors: AdminMessages["providers"]["g2bulk"]["errors"];
  lanes: ImportLane[];
  categories: AdminCategory[];
  /** Server action to call on submit. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the action signature varies per provider but the return type is ImportActionState
  formAction: (state: ImportActionState, formData: FormData) => Promise<any>;
  initialState: ImportActionState;
  /** Navigation link shown on the result screen. */
  backHref: string;
  /** "View in the store" link on the result screen. */
  viewStoreHref: string;
  /** Extra hidden fields to include in the form (e.g. categoryIds for MaxStore). */
  hiddenFields?: Array<{ name: string; value: string }>;
};

export function UniversalImportForm({
  locale,
  messages,
  providerErrors,
  lanes,
  categories,
  formAction,
  initialState,
  backHref,
  viewStoreHref,
  hiddenFields,
}: UniversalImportFormProps) {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(
    formAction as (state: ImportActionState, formData: FormData) => Promise<ImportActionState>,
    initialState,
  );
  const [query, setQuery] = useState("");
  const [activeLaneId, setActiveLaneId] = useState(lanes[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        lanes.flatMap((lane) =>
          lane.items.filter((item) => item.alreadyImported).map((item) => item.id),
        ),
      ),
  );
  const [removals, setRemovals] = useState<Map<string, RemoveImportedResult>>(new Map());

  const showCategoryPicker = categories.length > 0;

  const totalItems = useMemo(
    () => lanes.reduce((sum, lane) => sum + lane.items.length, 0),
    [lanes],
  );

  const visibleLanes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return lanes;
    return lanes.filter(
      (lane) =>
        lane.name.toLowerCase().includes(term) ||
        lane.items.some((item) => item.name.toLowerCase().includes(term)),
    );
  }, [lanes, query]);

  const activeLane =
    lanes.find((lane) => lane.id === activeLaneId) ?? visibleLanes[0] ?? lanes[0];

  const activeItems = useMemo(() => {
    if (!activeLane) return [];
    const term = query.trim().toLowerCase();
    if (!term) return activeLane.items;
    return activeLane.items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) || item.providerCode.toLowerCase().includes(term),
    );
  }, [activeLane, query]);

  const selectedCount = selected.size;

  function toggleItem(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectLaneItems(lane: ImportLane): void {
    setSelected((prev) => {
      const next = new Set(prev);
      lane.items.forEach((item) => next.add(item.id));
      return next;
    });
  }

  function clearLaneItems(lane: ImportLane): void {
    setSelected((prev) => {
      const next = new Set(prev);
      lane.items.forEach((item) => next.delete(item.id));
      return next;
    });
  }

  function selectAllVisible(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      visibleLanes.forEach((lane) => lane.items.forEach((item) => next.add(item.id)));
      return next;
    });
  }

  function clearAll(): void {
    setSelected(new Set());
  }

  function onRemoved(result: RemoveImportedResult, _code: string, itemId: string): void {
    setRemovals((prev) => new Map(prev).set(itemId, result));
    if (result.ok) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  const error =
    state.error === "no_selection"
      ? messages.noSelectionError
      : state.error
        ? (providerErrors[state.error as keyof typeof providerErrors] ?? providerErrors.unknown)
        : null;

  // ── Result screen ──────────────────────────────────────────────────────
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
          {(summary.itemsCreated > 0 || summary.itemsUpdated > 0) && (
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              {formatMessage(
                messages.resultOffers,
                { created: summary.itemsCreated, updated: summary.itemsUpdated },
                locale,
              )}
            </p>
          )}

          {summary.errors.length > 0 ? (
            <ul className="mt-4 grid gap-2">
              {summary.errors.map((err) => (
                <li
                  key={err.name}
                  className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
                >
                  <span dir="ltr">{err.name}</span> — {err.error}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={backHref}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
            >
              {messages.backToSync}
            </a>
            <a
              href={viewStoreHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
            >
              {messages.viewStore}
              <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────
  const showTwoPanel = lanes.length > 1;

  return (
    <form action={action} className="relative grid gap-5">
      {pending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--shell)_85%,transparent)] backdrop-blur-sm">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-strong)]">
            <SyncIcon className="size-4 animate-spin" />
            {messages.syncing}
          </span>
        </div>
      ) : null}

      <input type="hidden" name="locale" value={locale} />

      {hiddenFields?.map((field, i) => (
        <input key={`${field.name}-${i}`} type="hidden" name={field.name} value={field.value} />
      ))}

      {[...selected].map((itemId) => (
        <input key={itemId} type="hidden" name="productIds" value={itemId} />
      ))}

      {/* Header: counts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)] tabular-nums">
          {formatMessage(messages.availableCount, { count: totalItems }, locale)}
        </p>
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {formatMessage(messages.selectedCount, { count: selectedCount }, locale)}
        </p>
      </div>

      {/* Search + lane filter + bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4">
          <SearchIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
          <span className="sr-only">{messages.searchLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={messages.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>

        {showTwoPanel && (
          <select
            value={activeLaneId}
            onChange={(e) => setActiveLaneId(e.target.value)}
            className="min-h-11 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          >
            {visibleLanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name} ({lane.items.length})
              </option>
            ))}
          </select>
        )}

        <Button type="button" variant="secondary" size="sm" onClick={selectAllVisible}>
          {messages.selectAll}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          {messages.clearSelection}
        </Button>
      </div>

      {showTwoPanel ? (
        /* ── Two-panel layout (multiple lanes) ────────────────────────── */
        <div className="grid gap-4 lg:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)]">
          <nav
            aria-label="Categories"
            className="grid max-h-[32rem] gap-1 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-2"
          >
            {visibleLanes.map((lane) => {
              const active = lane.id === activeLane?.id;
              const laneSelected = lane.items.filter((item) => selected.has(item.id)).length;

              return (
                <button
                  key={lane.id}
                  type="button"
                  onClick={() => setActiveLaneId(lane.id)}
                  className={cn(
                    "grid gap-1 rounded-[var(--radius-control)] px-3 py-3 text-start transition-colors duration-[var(--duration)]",
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-strong)]"
                      : "text-[var(--ink-soft)] hover:bg-[var(--shell)]",
                  )}
                >
                  <span className="truncate text-sm font-semibold">{lane.name}</span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-[var(--ink-faint)] tabular-nums">
                    <span>{lane.items.length}</span>
                    {lane.hasStock !== undefined && (
                      <Badge tone={lane.hasStock ? "success" : "warning"} className="text-[10px]">
                        {lane.hasStock ? "In stock" : "Out of stock"}
                      </Badge>
                    )}
                    {laneSelected > 0 ? (
                      <span className="text-[var(--accent)]">{laneSelected} selected</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
            {activeLane ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-2 pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--ink)]">{activeLane.name}</h2>
                    <p className="mt-1 text-xs text-[var(--ink-muted)] tabular-nums">
                      {activeLane.items.length} items
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => selectLaneItems(activeLane)}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => clearLaneItems(activeLane)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <ItemGrid
                  items={activeItems}
                  selected={selected}
                  toggleItem={toggleItem}
                  categories={categories}
                  showCategoryPicker={showCategoryPicker}
                  messages={messages}
                  locale={locale}
                  onRemoved={onRemoved}
                />
              </>
            ) : (
              <p className="p-4 text-sm text-[var(--ink-muted)]">{messages.emptyTitle}</p>
            )}
          </section>
        </div>
      ) : (
        /* ── Flat list layout (single lane) ───────────────────────────── */
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
          {activeLane && (
            <div className="mb-3 flex items-center justify-between border-b border-[var(--line)] px-2 pb-3">
              <h2 className="text-base font-semibold text-[var(--ink)]">{activeLane.name}</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => selectLaneItems(activeLane)}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearLaneItems(activeLane)}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
          <ItemGrid
            items={activeItems}
            selected={selected}
            toggleItem={toggleItem}
            categories={categories}
            showCategoryPicker={showCategoryPicker}
            messages={messages}
            locale={locale}
            onRemoved={onRemoved}
          />
        </div>
      )}

      {/* Publish toggle */}
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
            {messages.publishHelp}
          </span>
        </span>
      </label>

      {/* Removal notices */}
      {[...removals.entries()].map(([itemId, result]) => {
        const item = lanes.flatMap((l) => l.items).find((i) => i.id === itemId);
        if (!item || !result.ok) return null;
        return (
          <p
            key={itemId}
            role="status"
            className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]"
          >
            {formatMessage(messages.removed, { name: item.name }, locale)}
          </p>
        );
      })}

      {[...removals.entries()].map(([itemId, result]) => {
        if (result.ok) return null;
        return (
          <p
            key={itemId}
            role="alert"
            className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
          >
            {result.reason === "not_imported" ? messages.removeMissing : messages.removeFailed}
          </p>
        );
      })}

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

// ── Item grid (shared between flat and two-panel layouts) ──────────────────

function ItemGrid({
  items,
  selected,
  toggleItem,
  categories,
  showCategoryPicker,
  messages,
  locale,
  onRemoved,
}: {
  items: ImportItem[];
  selected: Set<string>;
  toggleItem: (id: string) => void;
  categories: AdminCategory[];
  showCategoryPicker: boolean;
  messages: AdminMessages["import"];
  locale: Locale;
  onRemoved: (result: RemoveImportedResult, code: string, itemId: string) => void;
}) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-[var(--ink-muted)]">{messages.emptyTitle}</p>;
  }

  return (
    <ul className="grid max-h-[28rem] gap-2 overflow-y-auto">
      {items.map((item) => {
        const isSelected = selected.has(item.id);

        return (
          <li key={item.id}>
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
                  checked={isSelected}
                  onChange={() => toggleItem(item.id)}
                  className="size-4 shrink-0 accent-[var(--accent)]"
                />
                {item.imageUrl ? (
                  <span className="size-10 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt="" width={40} height={40} className="size-full object-cover" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--ink)]">
                      {item.name}
                    </span>
                    {item.alreadyImported ? (
                      <Badge tone="neutral" icon={<CheckIcon />}>
                        {messages.alreadyImported}
                      </Badge>
                    ) : null}
                    {!item.available ? (
                      <Badge tone="warning">{messages.emptyTitle}</Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--ink-faint)] tabular-nums">
                    {item.price != null && <span>{item.price.toFixed(2)} USD</span>}
                    {item.stockCount != null && <span>{item.stockCount} in stock</span>}
                    <span className="font-mono" dir="ltr">
                      {item.providerCode}
                    </span>
                  </span>
                </span>
                {item.alreadyImported ? (
                  <ImportRemoveButton
                    code={item.providerCode}
                    locale={locale}
                    label={messages.removeAction}
                    confirmMessage={messages.removeConfirm}
                    busy={messages.removing}
                    onDone={(result, code) => onRemoved(result, code, item.id)}
                  />
                ) : null}
              </label>
              {showCategoryPicker && (
                <div className="flex items-center gap-3 px-4 pb-3 ps-[calc(2.5rem)]">
                  <label className="grid min-w-0 flex-1 gap-1">
                    <span className="text-xs font-medium text-[var(--ink-faint)]">Category</span>
                    <select
                      name={`category-${item.id}`}
                      defaultValue={
                        item.currentCategoryId ??
                        categories.find(
                          (cat) =>
                            item.categoryName &&
                            cat.nameEn.toLowerCase() === item.categoryName.toLowerCase(),
                        )?.id ??
                        ""
                      }
                      className="min-h-9 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                    >
                      <option value="">No category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nameAr} / {cat.nameEn}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
