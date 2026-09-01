"use client";

import { useActionState, useState } from "react";
import { FormResult, SelectField, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages, CatalogMessages } from "@/i18n/messages";
import {
  INITIAL_CATALOG_STATE,
  type CatalogActionState,
} from "@/app/[locale]/dashboard/catalog/action-state";
import {
  createOfferAction,
  deleteOfferAction,
} from "@/app/[locale]/dashboard/catalog/actions";
import { toSlug } from "@/lib/catalog/slug";
import type { AdminProductOffer } from "@/lib/services/admin-catalog.service";

/**
 * Adding a package by hand, and removing one.
 *
 * Both live here rather than inside the pricing table above, for one reason
 * apiece. Adding is a different shape of work from repricing — one row, all its
 * fields — and removal cannot be a button on a pricing row at all: forms do not
 * nest, and that table is a single form saving every row at once.
 *
 * Removal names the package in a select and asks for a second click, which is
 * what a destructive control without an undo owes the person using it.
 */
export type OfferManageFormProps = {
  locale: Locale;
  gameId: string;
  offers: AdminProductOffer[];
  messages: AdminMessages["catalog"]["manageOffers"];
  errors: AdminMessages["catalog"]["errors"];
  /** Storefront labels for `offer_type`, so the select never shows a column value. */
  offerTypeLabels: CatalogMessages["offerTypes"];
};

const OFFER_TYPES = ["topup", "gift_card", "redeem_code"] as const;

export function OfferManageForm({
  locale,
  gameId,
  offers,
  messages,
  errors,
  offerTypeLabels,
}: OfferManageFormProps) {
  const [addState, addAction, adding] = useActionState<CatalogActionState, FormData>(
    createOfferAction,
    INITIAL_CATALOG_STATE,
  );
  const [removeState, removeAction, removing] = useActionState<CatalogActionState, FormData>(
    deleteOfferAction,
    INITIAL_CATALOG_STATE,
  );
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function resolveError(key: string | null): string | null {
    return key ? (errors[key as keyof typeof errors] ?? errors.unknown) : null;
  }

  return (
    <div className="grid gap-6">
      <form action={addAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="gameId" value={gameId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={messages.nameArLabel} name="nameAr" required maxLength={160} />
          <TextField
            label={messages.nameEnLabel}
            name="nameEn"
            required
            maxLength={160}
            dir="ltr"
            onChange={(event) => {
              if (!slugTouched) {
                setSlug(toSlug(event.target.value));
              }
            }}
          />
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
          />
          <TextField
            label={messages.priceLabel}
            name="price"
            type="number"
            min={0}
            step={0.01}
            required
            dir="ltr"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextAreaField
            label={messages.descriptionArLabel}
            name="descriptionAr"
            maxLength={4000}
            rows={3}
          />
          <TextAreaField
            label={messages.descriptionEnLabel}
            name="descriptionEn"
            maxLength={4000}
            rows={3}
            dir="ltr"
          />
        </div>

        <SelectField
          label={messages.typeLabel}
          name="offerType"
          defaultValue="topup"
          fieldClassName="max-w-xs"
          options={OFFER_TYPES.map((type) => ({ value: type, label: offerTypeLabels[type] }))}
        />

        <p
          role="note"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-xs leading-5 text-[var(--ink-muted)]"
        >
          {messages.manualNote}
        </p>

        <FormResult
          error={resolveError(addState.error)}
          notice={addState.notice === "offer_added" ? messages.added : null}
        />

        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={adding}>
            {messages.addAction}
          </Button>
        </div>
      </form>

      {offers.length > 0 ? (
        <form
          action={removeAction}
          className="grid gap-3 border-t border-[var(--line)] pt-6"
          onSubmit={() => setConfirming(false)}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="gameId" value={gameId} />

          <SelectField
            label={messages.removeLabel}
            hint={messages.removeHint}
            name="offerId"
            fieldClassName="max-w-md"
            onChange={() => setConfirming(false)}
            options={offers.map((offer) => ({
              value: offer.id,
              label: `${offer.nameEn || offer.nameAr} — ${offer.slug}`,
            }))}
          />

          <FormResult
            error={resolveError(removeState.error)}
            notice={removeState.notice === "offer_removed" ? messages.removed : null}
          />

          <div className="flex flex-wrap items-center gap-3">
            {confirming ? (
              <>
                <Button type="submit" variant="secondary" size="sm" disabled={removing}>
                  {messages.removeConfirmAction}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  {messages.cancelAction}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-[var(--danger)]"
                onClick={() => setConfirming(true)}
              >
                {messages.removeAction}
              </Button>
            )}
          </div>
        </form>
      ) : null}
    </div>
  );
}
