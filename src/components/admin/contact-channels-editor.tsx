"use client";

import { useActionState, useRef, useState } from "react";
import {
  CONTACT_FIELD_PREFIX,
  CONTACT_KIND_OPTIONS,
  INITIAL_WEBSITE_STATE,
  MAX_EDITOR_ROWS,
  resolveWebsiteError,
  rowField,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import { saveContactChannelsAction } from "@/app/[locale]/dashboard/website/actions";
import { FormResult, SelectField, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import type { ContactChannel, ContactChannelKind } from "@/lib/settings/public-settings";

/**
 * Contact channels editor.
 *
 * The whole list plus both notes are submitted together, so the contact page
 * never shows a half-applied change. The href a visitor follows is derived from
 * the kind and the value — an email becomes `mailto:`, a phone `tel:`, WhatsApp
 * and Telegram their deep links — so only the raw value is edited here.
 */
export type ContactChannelsEditorProps = {
  channels: ContactChannel[];
  noteAr: string;
  noteEn: string;
  messages: AdminMessages["website"]["contact"];
  errors: AdminMessages["website"]["errors"];
};

type ChannelRow = {
  key: string;
  kind: ContactChannelKind;
  labelAr: string;
  labelEn: string;
  value: string;
};

function toRows(channels: ContactChannel[]): ChannelRow[] {
  return channels.map((channel, index) => ({
    key: `saved-${index}`,
    kind: channel.kind,
    labelAr: channel.labelAr,
    labelEn: channel.labelEn,
    value: channel.value,
  }));
}

export function ContactChannelsEditor({
  channels,
  noteAr,
  noteEn,
  messages,
  errors,
}: ContactChannelsEditorProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    saveContactChannelsAction,
    INITIAL_WEBSITE_STATE,
  );
  const [rows, setRows] = useState<ChannelRow[]>(() => toRows(channels));
  const keySeed = useRef(0);

  const kindOptions = CONTACT_KIND_OPTIONS.map((kind) => ({
    value: kind,
    label: messages.kinds[kind],
  }));

  function addRow() {
    keySeed.current += 1;

    setRows((current) => [
      ...current,
      { key: `new-${keySeed.current}`, kind: "email", labelAr: "", labelEn: "", value: "" },
    ]);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  return (
    <form action={formAction} className="grid gap-4">
      <ul className="grid gap-3">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={messages.kind}
                name={rowField(CONTACT_FIELD_PREFIX, index, "kind")}
                defaultValue={row.kind}
                options={kindOptions}
              />
              <TextField
                label={messages.value}
                name={rowField(CONTACT_FIELD_PREFIX, index, "value")}
                defaultValue={row.value}
                maxLength={200}
                dir="ltr"
                spellCheck={false}
              />
              <TextField
                label={messages.labelAr}
                name={rowField(CONTACT_FIELD_PREFIX, index, "label_ar")}
                defaultValue={row.labelAr}
                maxLength={80}
              />
              <TextField
                label={messages.labelEn}
                name={rowField(CONTACT_FIELD_PREFIX, index, "label_en")}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <TextAreaField
          label={messages.noteAr}
          name="note_ar"
          defaultValue={noteAr}
          maxLength={400}
        />
        <TextAreaField
          label={messages.noteEn}
          name="note_en"
          defaultValue={noteEn}
          maxLength={400}
          dir="ltr"
        />
      </div>

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
