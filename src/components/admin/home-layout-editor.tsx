"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_WEBSITE_STATE,
  resolveWebsiteError,
  rowField,
  SECTION_FIELD_PREFIX,
  sectionPickKind,
  sectionUsesLimit,
  sectionUsesSubmitForm,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import {
  resetHomeLayoutAction,
  saveHomeLayoutAction,
} from "@/app/[locale]/dashboard/website/actions";
import { CheckboxField, FormResult, TextField } from "@/components/admin/admin-form";
import { SectionPickList } from "@/components/admin/section-pick-list";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  HOME_SECTION_LIMIT_MAX,
  HOME_SECTION_LIMIT_MIN,
  HOME_SECTION_TYPES,
  isSingletonSectionType,
  type HomeSection,
  type HomeSectionType,
} from "@/lib/home/layout";
import type { HomePickCandidates } from "@/lib/services/admin-website.service";

/**
 * Homepage section editor.
 *
 * The submitted list *is* the layout: order comes from the rows' order, a row
 * that is not submitted is a section that was removed, and a row with a new id
 * is one that was added. That is why there is one save button and no separate
 * add or delete action — a homepage half-rearranged is worse than one that
 * saves in a single step.
 *
 * Everything a section says or shows is here: both titles, both subtitles, how
 * many items it holds, whether it is on, and for the three handpicked types,
 * which items. What is not here is the carousel's rotation, which has a card of
 * its own further down the page; the action carries those values over by
 * section id so this form cannot flatten them.
 */
export type HomeLayoutEditorProps = {
  sections: HomeSection[];
  candidates: HomePickCandidates;
  locale: Locale;
  messages: AdminMessages["website"]["sections"];
  errors: AdminMessages["website"]["errors"];
};

type SectionRow = {
  id: string;
  type: HomeSectionType;
  enabled: boolean;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  /** Kept as text so clearing the field does not fight the input. */
  limit: string;
  picks: string[];
  showSubmitForm: boolean;
};

function picksOf(section: HomeSection): string[] {
  switch (sectionPickKind(section.type)) {
    case "games":
      return section.productIds;
    case "categories":
      return section.categoryIds;
    case "offers":
      return section.offerIds;
    case "reviews":
      return section.reviewIds;
    default:
      return [];
  }
}

function toRows(sections: HomeSection[]): SectionRow[] {
  return sections.map((section) => ({
    id: section.id,
    type: section.type,
    enabled: section.enabled,
    titleAr: section.titleAr,
    titleEn: section.titleEn,
    subtitleAr: section.subtitleAr,
    subtitleEn: section.subtitleEn,
    limit: String(section.limit),
    picks: picksOf(section),
    showSubmitForm: section.showSubmitForm,
  }));
}

/** Value-based identity of the saved layout, used to detect a server-side change. */
function layoutSignature(sections: HomeSection[]): string {
  return sections
    .map((section) =>
      [
        section.id,
        section.type,
        section.enabled,
        section.titleAr,
        section.titleEn,
        section.subtitleAr,
        section.subtitleEn,
        section.limit,
        section.showSubmitForm,
        picksOf(section).join("+"),
      ].join("|"),
    )
    .join("~");
}

export function HomeLayoutEditor({
  sections,
  candidates,
  locale,
  messages,
  errors,
}: HomeLayoutEditorProps) {
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
  const [addType, setAddType] = useState<HomeSectionType>("product_picks");

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
  const usedTypes = new Set(rows.map((row) => row.type));

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

  function remove(index: number) {
    setRows((current) => current.filter((_, at) => at !== index));
  }

  function add() {
    setRows((current) => {
      /*
       * The id is what the action matches a row to its saved section by, so a
       * new one has to be unique against the rows on screen — including a row
       * added, removed, and added again in the same sitting. Counting up from
       * the length would reuse an id in exactly that case.
       */
      let suffix = current.length + 1;
      let id = `${addType}_${suffix}`;

      while (current.some((row) => row.id === id)) {
        suffix += 1;
        id = `${addType}_${suffix}`;
      }

      return [
        ...current,
        {
          id,
          type: addType,
          enabled: true,
          titleAr: "",
          titleEn: "",
          subtitleAr: "",
          subtitleEn: "",
          limit: "8",
          picks: [],
          showSubmitForm: true,
        },
      ];
    });
  }

  const addableTypes = HOME_SECTION_TYPES.filter(
    (type) => !isSingletonSectionType(type) || !usedTypes.has(type),
  );

  return (
    <div className="grid gap-5">
      <form action={saveAction} className="grid gap-4">
        <ul className="grid gap-3">
          {rows.map((row, index) => {
            const kind = sectionPickKind(row.type);

            return (
              <li
                key={row.id}
                className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <input
                  type="hidden"
                  name={rowField(SECTION_FIELD_PREFIX, index, "id")}
                  value={row.id}
                />
                <input
                  type="hidden"
                  name={rowField(SECTION_FIELD_PREFIX, index, "type")}
                  value={row.type}
                />
                {/*
                  * The ticked ids as one field. A checkbox each would submit in
                  * document order and lose the order they were chosen in, which
                  * is the whole point of picking by hand.
                  */}
                <input
                  type="hidden"
                  name={rowField(SECTION_FIELD_PREFIX, index, "picks")}
                  value={row.picks.join(",")}
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--ink-faint)]">
                      {messages.typeLabel}
                    </p>
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
                    <Button
                      type="button"
                      variant="ghost"
                      // The homepage falls back to the default layout when a
                      // saved one has nothing enabled, so an empty list would
                      // not do what removing the last row appears to promise.
                      disabled={rows.length === 1}
                      onClick={() => remove(index)}
                    >
                      {messages.removeSection}
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

                  <TextField
                    label={messages.sectionSubtitleAr}
                    hint={messages.subtitleHint}
                    name={rowField(SECTION_FIELD_PREFIX, index, "subtitle_ar")}
                    value={row.subtitleAr}
                    onChange={(event) => update(index, { subtitleAr: event.target.value })}
                    maxLength={160}
                  />
                  <TextField
                    label={messages.sectionSubtitleEn}
                    hint={messages.subtitleHint}
                    name={rowField(SECTION_FIELD_PREFIX, index, "subtitle_en")}
                    value={row.subtitleEn}
                    onChange={(event) => update(index, { subtitleEn: event.target.value })}
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

                  {sectionUsesSubmitForm(row.type) ? (
                    <CheckboxField
                      label={messages.showSubmitForm}
                      hint={messages.showSubmitFormHint}
                      name={rowField(SECTION_FIELD_PREFIX, index, "show_submit_form")}
                      checked={row.showSubmitForm}
                      onChange={(event) => update(index, { showSubmitForm: event.target.checked })}
                      className="self-end"
                    />
                  ) : null}
                </div>

                {kind ? (
                  <div className="mt-4 grid gap-2">
                    <p className="text-xs font-medium text-[var(--ink-soft)]">
                      {messages.picksLabel}
                    </p>
                    <SectionPickList
                      candidates={candidates[kind]}
                      selected={row.picks}
                      onChange={(picks) => update(index, { picks })}
                      locale={locale}
                      max={HOME_SECTION_LIMIT_MAX}
                      messages={messages}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <FormResult error={error} notice={notice} />

        <div className="flex flex-wrap items-end gap-2">
          <Button type="submit" disabled={pending}>
            {messages.saveAction}
          </Button>
        </div>
      </form>

      <div className="grid gap-2 border-t border-[var(--line)] pt-5 sm:flex sm:items-end sm:gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[var(--ink-soft)]">{messages.addLabel}</span>
          <select
            value={addType}
            onChange={(event) => setAddType(event.target.value as HomeSectionType)}
            className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 pe-8 text-sm text-[var(--ink)] outline-none focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          >
            {addableTypes.map((type) => (
              <option key={type} value={type}>
                {messages.types[type]}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={pending || !addableTypes.includes(addType)}
        >
          {messages.addSection}
        </Button>

        <form action={resetAction} className="sm:ms-auto">
          <Button type="submit" variant="ghost" disabled={pending}>
            {messages.resetAction}
          </Button>
        </form>
      </div>
    </div>
  );
}
