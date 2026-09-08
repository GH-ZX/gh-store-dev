"use client";

import { useActionState, useState } from "react";
import { CheckboxField, TextField } from "@/components/admin/admin-form";
import { EditPanel, EditResult, EditTrigger } from "@/components/live-edit/edit-panel";
import { useLiveEdit } from "@/components/live-edit/live-edit-mode";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import { HOME_SECTION_LIMIT_MAX, HOME_SECTION_LIMIT_MIN } from "@/lib/home/layout";
import {
  INITIAL_LIVE_EDIT_STATE,
  resolveLiveEditError,
  type LiveEditState,
} from "@/lib/live-edit/action-state";
import { saveHomeSectionCopyAction } from "@/lib/live-edit/actions";

/**
 * Edit one homepage section without leaving the homepage.
 *
 * Only the section's own wording, whether it shows, and how many items it holds
 * — the things you can see are wrong while looking at the page. Which items a
 * handpicked section names is a longer decision with a picker behind it, and
 * that stays on the dashboard.
 */
export type SectionEditorProps = {
  sectionId: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  enabled: boolean;
  limit: number;
  /** Absent for the section types whose length the catalog decides. */
  usesLimit: boolean;
  label: string;
  messages: AdminMessages["liveEdit"];
};

export function SectionEditor({
  sectionId,
  titleAr,
  titleEn,
  subtitleAr,
  subtitleEn,
  enabled,
  limit,
  usesLimit,
  label,
  messages,
}: SectionEditorProps) {
  const editing = useLiveEdit();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<LiveEditState, FormData>(
    saveHomeSectionCopyAction,
    INITIAL_LIVE_EDIT_STATE,
  );

  /*
   * Close on a save that worked. The action revalidates, so the page behind the
   * panel is already showing the new heading by the time it goes — which is the
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
    }
  }

  if (!editing) {
    return null;
  }

  return (
    <>
      <EditTrigger label={`${messages.editSection}: ${label}`} onClick={() => setOpen(true)} />

      <EditPanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${messages.sectionPanelTitle} — ${label}`}
        closeLabel={messages.close}
      >
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="section_id" value={sectionId} />

          <TextField label={messages.titleAr} name="title_ar" defaultValue={titleAr} maxLength={160} />
          <TextField
            label={messages.titleEn}
            name="title_en"
            defaultValue={titleEn}
            maxLength={160}
            dir="ltr"
          />
          <TextField
            label={messages.subtitleAr}
            name="subtitle_ar"
            defaultValue={subtitleAr}
            maxLength={160}
          />
          <TextField
            label={messages.subtitleEn}
            name="subtitle_en"
            defaultValue={subtitleEn}
            maxLength={160}
            dir="ltr"
          />

          {usesLimit ? (
            <TextField
              label={messages.limit}
              name="limit"
              type="number"
              inputMode="numeric"
              defaultValue={limit}
              min={HOME_SECTION_LIMIT_MIN}
              max={HOME_SECTION_LIMIT_MAX}
              step={1}
              dir="ltr"
              fieldClassName="max-w-32"
              className="tabular-nums"
            />
          ) : null}

          <CheckboxField label={messages.enabled} name="enabled" defaultChecked={enabled} />

          <EditResult
            error={resolveLiveEditError(messages, state.error)}
            notice={state.notice}
            messages={messages}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {messages.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {messages.cancel}
            </Button>
          </div>
        </form>
      </EditPanel>
    </>
  );
}
