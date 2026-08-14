"use client";

import { useActionState, useRef, useState } from "react";
import {
  INITIAL_WEBSITE_STATE,
  MAX_EDITOR_ROWS,
  resolveWebsiteError,
  rowField,
  SOCIAL_FIELD_PREFIX,
  SOCIAL_PLATFORM_OPTIONS,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import { saveSocialLinksAction } from "@/app/[locale]/dashboard/website/actions";
import { FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { SocialIcon } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import type { SocialLink, SocialPlatform } from "@/lib/settings/public-settings";

/**
 * Social links editor.
 *
 * Rows are added and removed locally and the whole list is submitted at once, so
 * the saved value is always exactly what the admin sees — a removed row cannot
 * survive as a stale record. Fields are uncontrolled and keyed per row, which
 * lets a row be dropped from the middle without disturbing its neighbours.
 *
 * Platform options are the stored identifiers themselves: they are brand keys,
 * not copy, and the visible name of a link is its Arabic or English label.
 */
export type SocialLinksEditorProps = {
  links: SocialLink[];
  messages: AdminMessages["website"]["social"];
  errors: AdminMessages["website"]["errors"];
};

type LinkRow = {
  key: string;
  platform: SocialPlatform;
  labelAr: string;
  labelEn: string;
  url: string;
};

const PLATFORM_OPTIONS = SOCIAL_PLATFORM_OPTIONS.map((platform) => ({
  value: platform,
  label: platform,
}));

function toRows(links: SocialLink[]): LinkRow[] {
  return links.map((link, index) => ({
    key: `saved-${index}`,
    platform: link.platform,
    labelAr: link.labelAr,
    labelEn: link.labelEn,
    url: link.url,
  }));
}

export function SocialLinksEditor({ links, messages, errors }: SocialLinksEditorProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    saveSocialLinksAction,
    INITIAL_WEBSITE_STATE,
  );
  const [rows, setRows] = useState<LinkRow[]>(() => toRows(links));
  const keySeed = useRef(0);

  function addRow() {
    keySeed.current += 1;

    setRows((current) => [
      ...current,
      {
        key: `new-${keySeed.current}`,
        platform: "website",
        labelAr: "",
        labelEn: "",
        url: "",
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  /*
   * Mirrors the select into state for the preview only — the field itself stays
   * uncontrolled, so a row can still be removed from the middle of the list
   * without React re-using the neighbour's DOM node and its typing with it.
   */
  function setPlatform(key: string, platform: SocialPlatform) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, platform } : row)));
  }

  return (
    <form action={formAction} className="grid gap-4">
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">{messages.emptyHint}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
            >
              {/*
               * The mark the storefront will show, following the select as it
               * changes. Which platform a link belongs to is otherwise a word
               * in a dropdown, and a row set to the wrong one looks identical
               * to a right one until someone visits the page.
               */}
              <div className="mb-3 flex items-center gap-2 text-[var(--ink-soft)]">
                <SocialIcon platform={row.platform} className="size-5 shrink-0" />
                <span className="text-xs font-medium tracking-[0.08em] uppercase" dir="ltr">
                  {row.platform}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={messages.platform}
                  name={rowField(SOCIAL_FIELD_PREFIX, index, "platform")}
                  defaultValue={row.platform}
                  onChange={(event) => setPlatform(row.key, event.target.value as SocialPlatform)}
                  options={PLATFORM_OPTIONS}
                  dir="ltr"
                />
                <TextField
                  label={messages.url}
                  type="url"
                  name={rowField(SOCIAL_FIELD_PREFIX, index, "url")}
                  defaultValue={row.url}
                  maxLength={500}
                  dir="ltr"
                  inputMode="url"
                  spellCheck={false}
                />
                <TextField
                  label={messages.labelAr}
                  name={rowField(SOCIAL_FIELD_PREFIX, index, "label_ar")}
                  defaultValue={row.labelAr}
                  maxLength={80}
                />
                <TextField
                  label={messages.labelEn}
                  name={rowField(SOCIAL_FIELD_PREFIX, index, "label_en")}
                  defaultValue={row.labelEn}
                  maxLength={80}
                  dir="ltr"
                />
              </div>

              <div className="mt-3 flex justify-end">
                <Button type="button" variant="ghost" onClick={() => removeRow(row.key)}>
                  {messages.removeAction}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormResult
        error={resolveWebsiteError(errors, state.error)}
        notice={state.notice ? messages.saved : null}
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {messages.saveAction}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={addRow}
          // The action reads a fixed number of rows, so the form cannot offer more.
          disabled={rows.length >= MAX_EDITOR_ROWS}
        >
          {messages.addAction}
        </Button>
      </div>
    </form>
  );
}
