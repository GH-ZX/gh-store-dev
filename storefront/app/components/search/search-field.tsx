"use client";

import { useNavigate } from "react-router";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowIcon, CloseIcon, SearchIcon, TagIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { buildSearchPath, SEARCH_QUERY_MAX_LENGTH, type SearchFilter } from "@/lib/catalog/search";
import { cn } from "@/lib/cn";

/**
 * Catalog search input, with type-ahead suggestions.
 *
 * Submits through the router for a client transition, but keeps a real `action`
 * and `method="get"` so the form still works if JavaScript never loads — the
 * suggestion dropdown is an accelerator layered on top, never a replacement.
 * The active filter is preserved across a new query.
 *
 * **Combobox pattern.** The input is a combobox owning a listbox: suggestions
 * are traversable with the arrow keys, Enter opens the highlighted one, Enter
 * on nothing runs the full search as before, and Escape dismisses. Every
 * option carries its own id and `aria-selected` so `aria-activedescendant` can
 * announce the highlight without moving focus out of the field.
 *
 * Suggestions come from `/api/search/suggest` — the same `searchCatalog` read
 * the results page uses — debounced and aborted per keystroke. A failed or
 * empty response just means no dropdown; the field degrades to plain search.
 *
 * `defaultQuery` seeds the field once. To re-seed it from a changed URL, render
 * it with `key={query}` rather than syncing in an effect.
 */
export type SearchFieldProps = {
  locale: Locale;
  labels: {
    fieldLabel: string;
    placeholder: string;
    submit: string;
    clear: string;
    suggestionsLabel: string;
  };
  defaultQuery?: string;
  filter?: SearchFilter;
  size?: "sm" | "md";
  autoFocus?: boolean;
  className?: string;
};

type Suggestion = {
  key: string;
  href: string;
  label: string;
  kind: "product" | "offer";
};

type SuggestResponse = {
  products?: { slug: string; categorySlug: string; name: string }[];
  games?: { slug: string; categorySlug: string; name: string }[];
  offers?: { gameSlug: string; categorySlug: string; offerSlug: string; name: string }[];
};

/** Below this the catalog matches half its rows and the dropdown reads as noise. */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 180;

export function SearchField({
  locale,
  labels,
  defaultQuery = "",
  filter = "all",
  size = "md",
  autoFocus = false,
  className,
}: SearchFieldProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [draft, setDraft] = useState(defaultQuery);
  /*
   * The suggestions are stored with the query that produced them, and visible
   * ones are derived by comparing it to the current draft — so an outdated
   * response (or a draft shortened below the fetch threshold) hides itself by
   * derivation, with no state-resetting effect chasing the keystrokes.
   */
  const [result, setResult] = useState<{ key: string; items: Suggestion[] }>({
    key: "",
    items: [],
  });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const query = draft.trim();
  const resultKey = `${locale}:${filter}:${query}`;
  const suggestions = result.key === resultKey ? result.items : [];
  const expanded = open && suggestions.length > 0;

  const listId = useId();
  const active =
    expanded && activeIndex >= 0 ? (suggestions[activeIndex] ?? undefined) : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();

    if (!trimmed) {
      return;
    }

    dismiss();
    navigate(buildSearchPath(locale, { query: trimmed, filter }));
  }

  function choose(suggestion: Suggestion) {
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    navigate(suggestion.href);
  }

  function dismiss() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter" && active) {
      event.preventDefault();
      choose(active);
      return;
    }

    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => !expanded ? 0 : (index + 1) % suggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => !expanded || index <= 0 ? suggestions.length - 1 : index - 1);
        return;
      }
    }

    if (event.key === "Escape" && open) {
      // Escape dismisses the dropdown first; only a second press reaches the
      // input's native behaviours.
      event.preventDefault();
      dismiss();
      return;
    }

    if (event.key === "Tab") {
      dismiss();
    }
  }

  useEffect(() => {
    const trimmed = draft.trim();

    if (!open || trimmed.length < MIN_QUERY_LENGTH || result.key === `${locale}:${filter}:${trimmed}`) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/search/suggest?locale=${locale}&q=${encodeURIComponent(trimmed)}&type=${filter}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`suggest ${response.status}`);
          }

          return (await response.json()) as SuggestResponse;
        })
        .then((data) => {
          if (controller.signal.aborted) return;

          const items: Suggestion[] = [
            ...(data.products ?? data.games ?? []).map((product) => ({
              key: `product:${product.slug}`,
              kind: "product" as const,
              label: product.name,
              href: `/${locale}/${product.categorySlug}/${product.slug}`,
            })),
            ...(data.offers ?? [])
              .map((offer) => ({
                key: `offer:${offer.gameSlug}:${offer.offerSlug}`,
                kind: "offer" as const,
                label: offer.name,
                href: `/${locale}/${offer.categorySlug}/${offer.gameSlug}/${offer.offerSlug}`,
              })),
          ];

          // Stamped with the query it answers; a newer draft simply does not
          // match this stamp and renders nothing until its own response lands.
          setResult({ key: `${locale}:${filter}:${trimmed}`, items });
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          // Aborted requests are the normal cost of a faster keystroke; any
          // other failure quietly degrades to plain search.
          if (!controller.signal.aborted && (error as Error).name !== "AbortError") {
            setResult({ key: `${locale}:${filter}:${trimmed}`, items: [] });
            setActiveIndex(-1);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [draft, locale, filter, open, result.key]);

  useEffect(() => {
    if (expanded && activeIndex >= 0) {
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, expanded]);

  function clear() {
    setDraft("");
    dismiss();
    inputRef.current?.focus();
  }

  return (
    <div
      className={cn("relative", className)}
      // Clicking a suggestion happens after focus has moved through the list —
      // dismiss only when focus genuinely left the combobox and its listbox.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          dismiss();
        }
      }}
    >
      <form
        action={`/${locale}/search`}
        method="get"
        onSubmit={submit}
        role="search"
        aria-label={labels.fieldLabel}
        className={cn(
          "flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] ps-3 pe-1",
          size === "sm" ? "min-h-11" : "min-h-12",
          "transition-colors duration-[var(--duration)] focus-within:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]",
        )}
      >
        <input
          ref={inputRef}
          type="search"
          name="q"
          dir="auto"
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={labels.placeholder}
          aria-label={labels.fieldLabel}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={active ? optionId(listId, activeIndex) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          // Only set on the search page with no query yet, where the field is
          // the whole point of the page.
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] [&::-webkit-search-cancel-button]:hidden"
        />
        {filter !== "all" ? <input type="hidden" name="type" value={filter} /> : null}
        {draft ? (
          <button
            type="button"
            onClick={clear}
            aria-label={labels.clear}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] [&>svg]:size-4"
          >
            <CloseIcon />
          </button>
        ) : null}
        {/* The magnifier identifies the search action in either direction. */}
        <button
          type="submit"
          aria-label={labels.submit}
          disabled={!draft.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-[opacity,transform] duration-[var(--duration)] ease-[var(--ease-spring)] active:scale-95 disabled:opacity-40 [&>svg]:size-4"
        >
          <SearchIcon />
        </button>
      </form>

      {expanded ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={labels.suggestionsLabel}
          className="absolute inset-x-0 top-full z-50 mt-1.5 grid max-h-[min(420px,50dvh)] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-1 shadow-[var(--elevation-3)]"
          // Focus must not leave the input when the list is pressed, or blur
          // would dismiss it before the click lands.
          onPointerDown={(event) => event.preventDefault()}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.key}
              id={optionId(listId, index)}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => choose(suggestion)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-start text-sm transition-colors duration-150",
                  index === activeIndex
                    ? "bg-[var(--surface-strong)] text-[var(--ink)]"
                    : "text-[var(--ink-soft)]",
                )}
              >
                <TagIcon
                  className={cn(
                    "size-4 shrink-0",
                    suggestion.kind === "product" ? "text-[var(--accent)]" : "text-[var(--ink-faint)]",
                  )}
                />
                <span className="min-w-0 flex-1 truncate"><bdi>{suggestion.label}</bdi></span>
                <ArrowIcon
                  direction="end"
                  className="size-3.5 shrink-0 text-[var(--ink-faint)] rtl:rotate-180"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** DOM id of the option at `index`, for `aria-activedescendant`. */
function optionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}
