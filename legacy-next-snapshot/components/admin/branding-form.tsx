"use client";

import { useActionState } from "react";
import { INITIAL_WEBSITE_STATE, resolveWebsiteError, type WebsiteActionState } from "@/app/[locale]/dashboard/website/action-state";
import { saveBrandingAction } from "@/app/[locale]/dashboard/website/actions";
import { CheckboxField, FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

/**
 * Site name editor.
 *
 * The homepage browser tab always uses the configured name; the switch decides
 * whether it also spreads to the header, footer, and invoices. An empty field
 * means "use the built-in store brand".
 */
export type BrandingFormProps = {
  branding: PublicStoreSettings["branding"];
  messages: AdminMessages["website"]["branding"];
  errors: AdminMessages["website"]["errors"];
};

export function BrandingForm({ branding, messages, errors }: BrandingFormProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    saveBrandingAction,
    INITIAL_WEBSITE_STATE,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={messages.nameAr}
          name="name_ar"
          defaultValue={branding.nameAr}
          maxLength={80}
        />
        <TextField
          label={messages.nameEn}
          name="name_en"
          defaultValue={branding.nameEn}
          maxLength={80}
          dir="ltr"
        />
      </div>

      <CheckboxField
        label={messages.useEverywhere}
        hint={messages.useEverywhereHint}
        name="use_everywhere"
        defaultChecked={branding.useEverywhere}
      />

      <FormResult
        error={resolveWebsiteError(errors, state.error)}
        notice={state.notice ? messages.saved : null}
      />

      <div>
        <Button type="submit" disabled={pending}>
          {messages.saveAction}
        </Button>
      </div>
    </form>
  );
}