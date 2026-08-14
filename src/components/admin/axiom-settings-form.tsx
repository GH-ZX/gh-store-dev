"use client";

import { useActionState } from "react";
import { FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { LOG_LEVELS, type AxiomStatus } from "@/lib/settings/axiom-settings";
import {
  INITIAL_AXIOM_STATE,
  type AxiomActionState,
} from "@/app/[locale]/dashboard/providers/axiom-action-state";
import {
  saveAxiomSettingsAction,
  testAxiomAction,
} from "@/app/[locale]/dashboard/providers/axiom-actions";

type Messages = AdminMessages["providers"]["logging"];

/**
 * Where the store sends its logs.
 *
 * The token behaves like the supplier keys: typed once, stored server-side, and
 * afterwards represented only by a masked tail. Everything else is plain
 * configuration the owner can change without handling the secret.
 */
export function AxiomSettingsForm({
  locale,
  messages,
  status,
}: {
  locale: Locale;
  messages: Messages;
  status: AxiomStatus;
}) {
  const [saveState, saveAction, saving] = useActionState<AxiomActionState, FormData>(
    saveAxiomSettingsAction,
    INITIAL_AXIOM_STATE,
  );
  const [testState, testAction, testing] = useActionState<AxiomActionState, FormData>(
    testAxiomAction,
    INITIAL_AXIOM_STATE,
  );

  const errorKey = saveState.error ?? testState.error;
  const noticeKey = saveState.notice ?? testState.notice;

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />

        <TextField
          label={messages.tokenLabel}
          hint={`${messages.tokenHelp}${status.configured ? ` ${messages.tokenKeepHelp}` : ""}`}
          name="apiToken"
          type="password"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          placeholder={messages.tokenPlaceholder}
          className="font-mono"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={messages.datasetLabel}
            hint={messages.datasetHelp}
            name="dataset"
            defaultValue={status.dataset}
            dir="ltr"
            className="font-mono"
          />
          <TextField
            label={messages.domainLabel}
            hint={messages.domainHelp}
            name="domain"
            defaultValue={status.domain}
            dir="ltr"
            className="font-mono"
          />
        </div>

        <SelectField
          label={messages.levelLabel}
          hint={messages.levelHelp}
          name="minLevel"
          defaultValue={status.minLevel}
          dir="ltr"
          options={LOG_LEVELS.map((level) => ({ value: level, label: messages.levels[level] }))}
        />

        <label className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={status.enabled}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-sm text-[var(--ink)]">{messages.enabledLabel}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--ink-muted)]">
              {messages.enabledHelp}
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {messages.saveAction}
          </Button>
          {saveState.notice === "saved" ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.saved}
            </Badge>
          ) : null}
        </div>
      </form>

      <form action={testAction} className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary" size="sm" disabled={testing || !status.configured}>
          {messages.testAction}
        </Button>
        <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.testHelp}</span>
      </form>

      <FormResult
        error={errorKey ? (messages.errors[errorKey as keyof Messages["errors"]] ?? messages.errors.unknown) : null}
        notice={noticeKey === "tested" ? messages.tested : null}
      />
    </div>
  );
}
