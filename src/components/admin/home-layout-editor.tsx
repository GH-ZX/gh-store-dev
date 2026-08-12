"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_WEBSITE_STATE,
  resolveWebsiteError,
  rowField,
  SECTION_FIELD_PREFIX,
  sectionUsesLimit,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import {
  resetHomeLayoutAction,
  saveHomeLayoutAction,
} from "@/app/[locale]/dashboard/website/actions";
import { CheckboxField, FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import {
  HOME_SECTION_LIMIT_MAX,
  HOME_SECTION_LIMIT_MIN,
  type HomeSection,
  type HomeSectionType,
} from "@/lib/home/layout";

/**
 * Homepage section editor.
 *
 * Order is edited locally with up/down buttons and the whole ordered list is
 * submitted in one action, so a reorder is never half-saved. Only the fields an
 * operator changes day to day are here — order, visibility, titles, item count;
 * the pick lists and the carousel interval keep their saved values because the
 * action carries them over by section id.
 */
export type HomeLayoutEditorProps = {
  sections: HomeSection[];
  messages: AdminMessages["website"]["sections"];
  errors: AdminMessages["website"]["errors"];
};

type SectionRow = {
  id: string;
  type: HomeSectionType;
  enabled: boolean;
  titleAr: string;
  titleEn: string;
  /** Kept as text so clearing the field does not fight the input. */
  limit: string;
};

function toRows(sections: HomeSection[]): SectionRow[] {
  return sections.map((section) => ({
    id: section.id,
    type: section.type,
    enabled: section.enabled,
    titleAr: section.titleAr,
    titleEn: section.titleEn,
    limit: String(section.limit),
  }));
}

/** Value-based identity of the saved layout, used to detect a server-side change. */
function layoutSignature(sections: HomeSection[]): string {
  return sections
    .map((section) =>
      [section.id, section.type, section.enabled, section.titleAr, section.titleEn, section.limit].join(
        "|",
      ),
    )
    .join("~");
}

export function HomeLayoutEditor({ sections, messages, errors }: HomeLayoutEditorProps) {
  const [saveState, saveAction, saving] = useActionState<WebsiteActionState, FormData>(
    saveHomeLayoutAction,
    INITIAL_WEBSITE_STATE,
  );
  const [resetState, resetAction, resetting] = useActionState<WebsiteActionState, FormData>(
    resetHomeLayoutAction,
    INITIAL_WEBSITE_STATE,
  );
  const [rows, setRows] = useState<SectionRow[]>(() => toRows(sections));
  const [syncedSignature, setSyncedSignature] = useState(() => layoutSignature(sections));

  const savedSignature = layoutSignature(sections);

  /*
   * Adopt the saved layout when it changes under us — restoring the default order
   * rewrites every row. Comparing values rather than array identity keeps unsaved
   * edits through an unrelated re-render, and adjusting state during render means
   * no stale row is ever painted.
   */
  if (savedSignature !== syncedSignature) {
    setSyncedSignature(savedSignature);
    setRows(toRows(sections));
  }

  const pending = saving || resetting;
  const error = resolveWebsiteError(errors, saveState.error ?? resetState.error);
  const notice = (saveState.notice ?? resetState.notice) ? messages.saved : null;

  function update(index: number, patch: Partial<SectionRow>) {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, offset: number) {
    setRows((current) => {
      const target = index + offset;

      if (target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);

      return next;
    });
  }

  return (
    <div className="grid gap-5">
      <form action={saveAction} className="grid gap-4">
        <ul className="grid gap-3">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
            >
              <input type="hidden" name={rowField(SECTION_FIELD_PREFIX, index, "id")} value={row.id} />
              <input
                type="hidden"
                name={rowField(SECTION_FIELD_PREFIX, index, "type")}
                value={row.type}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.typeLabel}</p>
                  <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
                    {messages.types[row.type]}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    leadingIcon={<ChevronIcon direction="up" />}
                  >
                    {messages.moveUp}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    leadingIcon={<ChevronIcon direction="down" />}
                  >
                    {messages.moveDown}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <TextField
                  label={messages.sectionTitleAr}
                  name={rowField(SECTION_FIELD_PREFIX, index, "title_ar")}
                  value={row.titleAr}
                  onChange={(event) => update(index, { titleAr: event.target.value })}
                  maxLength={160}
                />
                <TextField
                  label={messages.sectionTitleEn}
                  name={rowField(SECTION_FIELD_PREFIX, index, "title_en")}
                  value={row.titleEn}
                  onChange={(event) => update(index, { titleEn: event.target.value })}
                  maxLength={160}
                  dir="ltr"
                />

                {sectionUsesLimit(row.type) ? (
                  <TextField
                    label={messages.limit}
                    type="number"
                    inputMode="numeric"
                    name={rowField(SECTION_FIELD_PREFIX, index, "limit")}
                    value={row.limit}
                    onChange={(event) => update(index, { limit: event.target.value })}
                    min={HOME_SECTION_LIMIT_MIN}
                    max={HOME_SECTION_LIMIT_MAX}
                    step={1}
                    dir="ltr"
                    className="tabular-nums"
                  />
                ) : null}

                <CheckboxField
                  label={messages.enabled}
                  name={rowField(SECTION_FIELD_PREFIX, index, "enabled")}
                  checked={row.enabled}
                  onChange={(event) => update(index, { enabled: event.target.checked })}
                  className="self-end"
                />
              </div>
            </li>
          ))}
        </ul>

        <FormResult error={error} notice={notice} />

        <div>
          <Button type="submit" disabled={pending}>
            {messages.saveAction}
          </Button>
        </div>
      </form>

      <form action={resetAction} className="border-t border-[var(--line)] pt-5">
        <Button type="submit" variant="ghost" disabled={pending}>
          {messages.resetAction}
        </Button>
      </form>
    </div>
  );
}
