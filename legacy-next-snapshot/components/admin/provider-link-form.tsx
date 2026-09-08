"use client";

import { useActionState } from "react";
import {
  INITIAL_CATALOG_STATE,
} from "@/app/[locale]/dashboard/catalog/action-state";
import { saveProviderLinkAction } from "@/app/[locale]/dashboard/catalog/actions";
import { TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";

export type ProviderLinkMessages = {
  label: string;
  hint: string;
  save: string;
  saved: string;
  errorInvalid: string;
  errorUnknown: string;
};

/**
 * One-row editor for the supplier listing link of a catalog entry.
 *
 * Deliberately its own form, separate from the game details above: the URL
 * describes where the supplier sells the product, so saving it must not touch
 * (or wait for) the game row itself.
 */
export function ProviderLinkForm({
  locale,
  gameId,
  url,
  messages,
}: {
  locale: Locale;
  gameId: string;
  url: string | null;
  messages: ProviderLinkMessages;
}) {
  const [state, formAction, pending] = useActionState(
    saveProviderLinkAction,
    INITIAL_CATALOG_STATE,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="gameId" value={gameId} />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <TextField
          label={messages.label}
          hint={messages.hint}
          name="providerUrl"
          defaultValue={url ?? ""}
          dir="ltr"
          maxLength={2048}
          placeholder="https://…"
          className="font-mono text-xs"
          fieldClassName="sm:max-w-md"
        />

        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {messages.save}
        </Button>
      </div>

      {state.notice ? (
        <p className="text-xs font-medium text-[var(--success)]">{messages.saved}</p>
      ) : null}
      {state.error ? (
        <p className="text-xs font-medium text-[var(--danger)]">
          {state.error === "provider_link_invalid" ? messages.errorInvalid : messages.errorUnknown}
        </p>
      ) : null}
    </form>
  );
}
