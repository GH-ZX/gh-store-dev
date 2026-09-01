"use client";

import { useActionState, useState } from "react";
import { FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_CATALOG_STATE,
  type CatalogActionState,
} from "@/app/[locale]/dashboard/catalog/action-state";
import { createProductAction } from "@/app/[locale]/dashboard/catalog/actions";
import { toSlug } from "@/lib/catalog/slug";

/**
 * A new game, in three fields.
 *
 * Everything else a game has is an edit, and the editor for it already exists —
 * so this asks for the minimum a row cannot exist without and then hands over.
 *
 * The slug follows the English name until the moment someone types their own,
 * after which it is left alone: a slug is a public address, and quietly
 * rewriting one an operator has chosen is worse than making them fill a field.
 */
export type ProductCreateFormProps = {
  locale: Locale;
  messages: AdminMessages["catalog"]["create"];
  errors: AdminMessages["catalog"]["errors"];
};

export function ProductCreateForm({ locale, messages, errors }: ProductCreateFormProps) {
  const [state, formAction, pending] = useActionState<CatalogActionState, FormData>(
    createProductAction,
    INITIAL_CATALOG_STATE,
  );
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function onNameEnChange(value: string): void {
    if (!slugTouched) {
      setSlug(toSlug(value));
    }
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={messages.nameArLabel} name="nameAr" required maxLength={160} />
        <TextField
          label={messages.nameEnLabel}
          name="nameEn"
          required
          maxLength={160}
          dir="ltr"
          onChange={(event) => onNameEnChange(event.target.value)}
        />
      </div>

      <TextField
        label={messages.slugLabel}
        hint={messages.slugHint}
        name="slug"
        required
        maxLength={80}
        dir="ltr"
        spellCheck={false}
        value={slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(toSlug(event.target.value));
        }}
        fieldClassName="max-w-md"
      />

      <FormResult
        error={state.error ? (errors[state.error as keyof typeof errors] ?? errors.unknown) : null}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {messages.submitAction}
        </Button>
        <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.draftNote}</span>
      </div>
    </form>
  );
}
