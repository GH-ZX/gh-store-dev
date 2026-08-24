"use client";

import { useActionState } from "react";
import { TextField } from "@/components/admin/admin-form";
import { EmptyState } from "@/components/shared/states";
import { StoreImage } from "@/components/store/store-image";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_IGDB_SEARCH_STATE,
  type IgdbSearchState,
} from "@/app/[locale]/dashboard/catalog/action-state";
import { searchIgdbArtworkAction } from "@/app/[locale]/dashboard/catalog/actions";

/**
 * IGDB artwork search inside the game editor.
 *
 * A picker, not a writer: choosing an image only fills the editor's own URL
 * fields, and nothing reaches the database until the admin saves the game. That
 * keeps one write path for catalog changes and makes the picker safe to play
 * with — a mis-click costs a field edit, not a row.
 */
export type IgdbArtworkPickerProps = {
  locale: Locale;
  messages: AdminMessages["catalog"]["game"]["igdb"];
  /** Fills the cover URL field of the surrounding game form. */
  onPickCover: (url: string) => void;
  /** Fills the logo URL field of the surrounding game form. */
  onPickArtwork: (url: string) => void;
};

function resolveError(messages: IgdbArtworkPickerProps["messages"], key: string | null): string | null {
  if (!key) {
    return null;
  }

  switch (key) {
    case "empty_query":
      return messages.emptyQuery;
    case "not_configured":
      return messages.notConfigured;
    default:
      return messages.failed;
  }
}

export function IgdbArtworkPicker({ locale, messages, onPickCover, onPickArtwork }: IgdbArtworkPickerProps) {
  const [state, searchAction, searching] = useActionState<IgdbSearchState, FormData>(
    searchIgdbArtworkAction,
    INITIAL_IGDB_SEARCH_STATE,
  );

  const error = resolveError(messages, state.error);
  const searched = state.results.length > 0 || (state.query.length > 0 && !searching);

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
      <p className="text-sm font-semibold text-[var(--ink)]">{messages.title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{messages.description}</p>

      <form action={searchAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="locale" value={locale} />
        <TextField
          label={messages.searchLabel}
          name="query"
          defaultValue={state.query}
          placeholder={messages.searchPlaceholder}
          maxLength={80}
          dir="ltr"
          fieldClassName="min-w-0 flex-1 basis-56"
        />
        <Button type="submit" variant="secondary" disabled={searching} leadingIcon={<SearchIcon />}>
          {messages.searchAction}
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      {state.results.length > 0 ? (
        <>
          <p className="mt-4 text-xs text-[var(--ink-faint)]">{messages.pickHint}</p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {state.results.map((result) => (
              <li
                key={`${result.name}-${result.coverUrl ?? result.artworkUrl ?? "none"}`}
                className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]"
              >
                <button
                  type="button"
                  // The whole tile is the primary pick: the cover field is what
                  // most games are missing, so it should not need aiming.
                  onClick={() => {
                    if (result.coverUrl) {
                      onPickCover(result.coverUrl);
                    }
                  }}
                  className="block w-full cursor-pointer"
                  title={messages.useAsCover}
                >
                  <span className="block aspect-[3/4] w-full">
                    <StoreImage src={result.thumbUrl ?? result.coverUrl} alt={result.name} sizes="160px" />
                  </span>
                </button>
                <div className="grid gap-1.5 p-2">
                  <span className="truncate text-xs font-medium text-[var(--ink)]" title={result.name}>
                    {result.name}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.coverUrl ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => onPickCover(result.coverUrl!)}>
                        {messages.useAsCover}
                      </Button>
                    ) : null}
                    {result.artworkUrl ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onPickArtwork(result.artworkUrl!)}
                      >
                        {messages.useAsArtwork}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : searched && !error ? (
        <div className="mt-4">
          <EmptyState title={messages.emptyTitle} description={messages.emptyDescription} />
        </div>
      ) : null}
    </div>
  );
}
