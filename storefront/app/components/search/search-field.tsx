"use client";

import { useNavigate } from "react-router";
import { useRef, useState, type FormEvent } from "react";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { buildSearchPath, SEARCH_QUERY_MAX_LENGTH, type SearchFilter } from "@/lib/catalog/search";
import { cn } from "@/lib/cn";

export type SearchFieldProps = {
  locale: Locale;
  labels: {
    fieldLabel: string;
    placeholder: string;
    submit: string;
    clear: string;
    suggestionsLabel?: string;
  };
  defaultQuery?: string;
  filter?: SearchFilter;
  size?: "sm" | "md";
  autoFocus?: boolean;
  /** Connect an optional visible label to this field. */
  inputId?: string;
  className?: string;
};

export function SearchField({
  locale,
  labels,
  defaultQuery = "",
  filter = "all",
  size = "md",
  autoFocus = false,
  inputId,
  className,
}: SearchFieldProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(defaultQuery);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();

    if (!trimmed) {
      navigate(`/${locale}/search`);
      return;
    }

    navigate(buildSearchPath(locale, { query: trimmed, filter }));
  }

  function clear() {
    setDraft("");
    inputRef.current?.focus();
  }

  return (
    <div className={cn("relative sf-search-container", className)}>
      <form
        action={`/${locale}/search`}
        method="get"
        onSubmit={submit}
        role="search"
        aria-label={labels.fieldLabel}
        className={cn(
          "sf-search-form flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] ps-3 pe-1",
          size === "sm" ? "min-h-11" : "min-h-12",
          "transition-all duration-150 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]",
        )}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          name="q"
          dir="auto"
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={labels.placeholder}
          aria-label={labels.fieldLabel}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
          className="sf-search-input min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--ink)] outline-none border-none ring-0 focus:outline-none focus:ring-0 focus:border-none shadow-none focus:shadow-none placeholder:text-[var(--ink-faint)] [&::-webkit-search-cancel-button]:hidden"
        />
        {filter !== "all" ? <input type="hidden" name="type" value={filter} /> : null}
        {draft ? (
          <button
            type="button"
            onClick={clear}
            aria-label={labels.clear}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] cursor-pointer [&>svg]:size-4"
          >
            <CloseIcon />
          </button>
        ) : null}
        {/* Search button always active to allow navigation to search page */}
        <button
          type="submit"
          aria-label={labels.submit}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-[opacity,transform] duration-[var(--duration)] ease-[var(--ease-spring)] active:scale-95 cursor-pointer hover:opacity-90 [&>svg]:size-4"
        >
          <SearchIcon />
        </button>
      </form>
    </div>
  );
}
