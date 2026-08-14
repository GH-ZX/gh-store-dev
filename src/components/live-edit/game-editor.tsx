"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckboxField, TextAreaField, TextField } from "@/components/admin/admin-form";
import { EditPanel, EditResult, EditTrigger } from "@/components/live-edit/edit-panel";
import { useLiveEdit } from "@/components/live-edit/live-edit-mode";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_LIVE_EDIT_STATE,
  resolveLiveEditError,
  type LiveEditState,
} from "@/lib/live-edit/action-state";
import {
  loadGamePresentationAction,
  saveGamePresentationAction,
  type GamePresentation,
} from "@/lib/live-edit/actions";

/**
 * Edit a game's name and artwork from wherever it appears.
 *
 * The fields are the ones you can judge by looking: both names, both
 * descriptions, the artwork, the logo, the carousel badge, and whether it is
 * featured or in the carousel. Price, packages and the slug are not here — they
 * change what a customer pays or where a link points, and those belong on the
 * catalog page with its own warnings, which is what the link at the bottom is
 * for.
 *
 * The panel edits only what it shows; the action reads the row, merges these
 * fields into it and writes it back, so nothing this form omits is cleared.
 */
export type GameEditorProps = {
  gameId: string;
  gameSlug: string;
  /** Display name for the panel heading and the trigger's label. */
  label: string;
  locale: Locale;
  messages: AdminMessages["liveEdit"];
  className?: string;
};

export function GameEditor({
  gameId,
  gameSlug,
  label,
  locale,
  messages,
  className,
}: GameEditorProps) {
  const editing = useLiveEdit();
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<GamePresentation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<LiveEditState, FormData>(
    saveGamePresentationAction,
    INITIAL_LIVE_EDIT_STATE,
  );

  /*
   * Close on a save that worked. The action revalidates, so the card behind the
   * panel is already showing the new artwork by the time it goes — which is the
   * entire point of editing here rather than on the dashboard.
   *
   * Keyed on the result object rather than on its contents, and adjusted during
   * render rather than from an effect: two successful saves in a row return the
   * same message, so comparing values would miss the second one, and closing
   * from an effect paints the panel once more on its way out.
   */
  const [seenResult, setSeenResult] = useState(state);

  if (seenResult !== state) {
    setSeenResult(state);

    if (state.notice) {
      setOpen(false);
      // Dropped rather than kept: the row has moved on, and reopening the panel
      // should show what was saved rather than what this form last held.
      setGame(null);
    }
  }

  if (!editing) {
    return null;
  }

  async function openPanel() {
    setOpen(true);
    setLoadError(null);

    const result = await loadGamePresentationAction(gameId);

    if (result.ok) {
      setGame(result.game);
    } else {
      setLoadError(result.error);
    }
  }

  return (
    <>
      <EditTrigger
        label={`${messages.editGame}: ${label}`}
        onClick={() => void openPanel()}
        className={className}
      />

      <EditPanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${messages.gamePanelTitle} — ${label}`}
        closeLabel={messages.close}
      >
        {loadError ? (
          <p role="alert" className="text-sm leading-6 text-[var(--danger)]">
            {resolveLiveEditError(messages, loadError)}
          </p>
        ) : !game ? (
          <p className="text-sm leading-6 text-[var(--ink-muted)]">{messages.loading}</p>
        ) : (
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="game_id" value={gameId} />

            <TextField
              label={messages.nameAr}
              name="name_ar"
              defaultValue={game.nameAr}
              maxLength={160}
              required
            />
            <TextField
              label={messages.nameEn}
              name="name_en"
              defaultValue={game.nameEn}
              maxLength={160}
              dir="ltr"
              required
            />

            <TextAreaField
              label={messages.descriptionAr}
              name="description_ar"
              defaultValue={game.descriptionAr}
              maxLength={600}
            />
            <TextAreaField
              label={messages.descriptionEn}
              name="description_en"
              defaultValue={game.descriptionEn}
              maxLength={600}
              dir="ltr"
            />

            <TextField
              label={messages.imageUrl}
              name="image_url"
              defaultValue={game.imageUrl}
              maxLength={600}
              dir="ltr"
              inputMode="url"
            />
            <TextField
              label={messages.logoUrl}
              name="logo_url"
              defaultValue={game.logoUrl}
              maxLength={600}
              dir="ltr"
              inputMode="url"
            />

            <TextField
              label={messages.badgeAr}
              name="carousel_badge_ar"
              defaultValue={game.carouselBadgeAr}
              maxLength={160}
            />
            <TextField
              label={messages.badgeEn}
              name="carousel_badge_en"
              defaultValue={game.carouselBadgeEn}
              maxLength={160}
              dir="ltr"
            />

            <CheckboxField
              label={messages.isFeatured}
              name="is_featured"
              defaultChecked={game.isFeatured}
            />
            <CheckboxField
              label={messages.showInCarousel}
              name="show_in_carousel"
              defaultChecked={game.showInCarousel}
            />

            <EditResult
              error={resolveLiveEditError(messages, state.error)}
              notice={state.notice}
              messages={messages}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={pending}>
                {messages.save}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {messages.cancel}
              </Button>
              <Link
                href={`/${locale}/dashboard/catalog?q=${encodeURIComponent(gameSlug)}`}
                className="ms-auto text-xs text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
              >
                {messages.openCatalog}
              </Link>
            </div>
          </form>
        )}
      </EditPanel>
    </>
  );
}
