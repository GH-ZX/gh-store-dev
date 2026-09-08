"use client";

import { useActionState } from "react";
import { TextField } from "@/components/admin/admin-form";
import { SecretField } from "@/components/admin/secret-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, ShieldIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_PROVIDER_STATE,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import {
  saveIgdbSettingsAction,
  verifyIgdbAction,
} from "@/app/[locale]/dashboard/providers/actions";
import type { IgdbStatus } from "@/lib/settings/igdb-settings";

/**
 * IGDB credentials — where catalog artwork comes from.
 *
 * Built to read like the supplier panels beside it: the client id is shown in
 * full because Twitch publishes it on every user-facing app anyway, and only
 * the secret is masked with the same locked-field treatment. The verify button
 * runs a real search, because a token that authorizes but cannot query is the
 * failure an owner would otherwise discover inside a game edit.
 */
export type IgdbSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["igdb"];
  errors: AdminMessages["providers"]["g2bulk"]["errors"];
  status: IgdbStatus;
  secrets: AdminMessages["providers"]["secrets"];
};

export function IgdbSettingsForm({ locale, messages, errors, status, secrets }: IgdbSettingsFormProps) {
  const [saveState, saveAction, saving] = useActionState<ProviderActionState, FormData>(
    saveIgdbSettingsAction,
    INITIAL_PROVIDER_STATE,
  );
  const [verifyState, verifyAction, verifying] = useActionState<ProviderActionState, FormData>(
    verifyIgdbAction,
    INITIAL_PROVIDER_STATE,
  );

  const errorKey = saveState.error ?? verifyState.error;
  const error = errorKey ? (errors[errorKey as keyof typeof errors] ?? errors.unknown) : null;

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />

        <TextField
          label={messages.clientIdLabel}
          name="clientId"
          placeholder={messages.clientIdPlaceholder}
          hint={messages.clientIdHelp}
          defaultValue={status.clientId ?? ""}
          maxLength={200}
          dir="ltr"
          spellCheck={false}
        />

        <SecretField
          label={messages.secretLabel}
          name="clientSecret"
          placeholder={messages.secretPlaceholder}
          hint={messages.secretHelp}
          keepHint={messages.secretKeepHelp}
          lockedHint={secrets.lockedHint}
          editLabel={secrets.editAction}
          cancelLabel={secrets.cancelAction}
          configured={status.configured}
        />

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

      <form
        action={verifyAction}
        className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6"
      >
        <input type="hidden" name="locale" value={locale} />
        <Button
          type="submit"
          variant="secondary"
          disabled={verifying || !status.configured}
          leadingIcon={<ShieldIcon />}
        >
          {messages.testAction}
        </Button>

        {verifyState.notice === "verified" ? (
          <Badge tone="success" icon={<CheckIcon />}>
            {messages.verified}
          </Badge>
        ) : null}
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
