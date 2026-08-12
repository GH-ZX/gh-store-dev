"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { buildSearchPath, type SearchFilter } from "@/lib/catalog/search";
import { cn } from "@/lib/cn";

/**
 * Catalog search input.
 *
 * Submits through the router for a client transition, but keeps a real `action`
 * and `method="get"` so the form still works if JavaScript never loads. The
 * active filter is preserved across a new query.
 *
 * `defaultQuery` seeds the field once. To re-seed it from a changed URL, render
 * it with `key={query}` rather than syncing in an effect.
 */
export type SearchFieldProps = {
  locale: Locale;
  labels: { fieldLabel: string; placeholder: string; submit: string; clear: string };
  defaultQuery?: string;
  filter?: SearchFilter;
  size?: "sm" | "md";
  autoFocus?: boolean;
  className?: string;
};

export function SearchField({
  locale,
  labels,
  defaultQuery = "",
  filter = "all",
  size = "md",
  autoFocus = false,
  className,
}: SearchFieldProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(defaultQuery);

  function submit(event: FormEvent<HTMLFormElement>) {
    const trimmed = draft.trim();

    if (!trimmed) {
      return;
    }

    event.preventDefault();
    router.push(buildSearchPath(locale, { query: trimmed, filter }));
  }

  function clear() {
    setDraft("");
    inputRef.current?.focus();
  }

  return (
    <form
      action={`/${locale}/search`}
      method="get"
      onSubmit={submit}
      role="search"
      className={cn(
        "flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] ps-3 pe-1",
        size === "sm" ? "min-h-10" : "min-h-12",
        "transition-colors duration-[var(--duration)] focus-within:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]",
        className,
      )}
    >
      <SearchIcon className="size-4.5 shrink-0 text-[var(--ink-muted)]" />
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={labels.placeholder}
        aria-label={labels.fieldLabel}
        autoComplete="off"
        enterKeyHint="search"
        // Only set on the search page with no query yet, where the field is the
        // whole point of the page.
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] [&::-webkit-search-cancel-button]:hidden"
      />
      {filter !== "all" ? <input type="hidden" name="type" value={filter} /> : null}
      {draft ? (
        <button
          type="button"
          onClick={clear}
          aria-label={labels.clear}
          className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] [&>svg]:size-4"
        >
          <CloseIcon />
        </button>
      ) : null}
      <button
        type="submit"
        aria-label={labels.submit}
        disabled={!draft.trim()}
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-[opacity,transform] duration-[var(--duration)] ease-[var(--ease-spring)] active:scale-95 disabled:opacity-40 [&>svg]:size-4",
          size === "sm" ? "size-8" : "size-10",
        )}
      >
        <SearchIcon />
      </button>
    </form>
  );
}
