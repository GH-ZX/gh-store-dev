"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  AdminCard,
  CheckboxField,
  FormResult,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/admin/admin-form";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages, CatalogMessages } from "@/i18n/messages";
import {
  INITIAL_CATALOG_STATE,
  type CatalogActionState,
} from "@/app/[locale]/dashboard/catalog/action-state";
import { updateOffersAction } from "@/lib/admin-actions";
import { OfferPriceField } from "@/components/admin/offer-price-field";
import type { SavedOfferPrice } from "@/lib/catalog/offer-price-draft";
import { formatPrice } from "@/lib/format/money";
import type { AdminProductOffer, PricingMode } from "@server/legacy/lib/services/admin-catalog.service";

/**
 * Package price editor.
 *
 * Every package of one product is edited in a single form and saved in one action,
 * because repricing a product means comparing its packages against each other,
 * not saving them one at a time. Fields are named `offers.<index>.<field>` and
 * the hidden id list carries the row order, so the action can rebuild the rows.
 *
 * Supplier cost and margin are text, never inputs: cost belongs to the provider
 * sync, and an editable copy of it would drift from what the store actually pays.
 */
export type OfferRowsFormProps = {
  locale: Locale;
  messages: AdminMessages["catalog"]["offers"];
  errors: AdminMessages["catalog"]["errors"];
  /** Storefront labels for `offer_type`, so a row never shows a raw column value. */
  offerTypes: CatalogMessages["offerTypes"];
  gameId: string;
  offers: AdminProductOffer[];
};

/** Kept in step with the service's union by `satisfies`, not by convention. */
const PRICING_MODE_ORDER = ["default", "custom", "fixed"] as const satisfies readonly PricingMode[];

const READ_ONLY_VALUE_CLASSES = "text-xs text-[var(--ink-soft)] tabular-nums";
type OfferRowsState = CatalogActionState & { savedPrices: Record<string, SavedOfferPrice> };

function resolveError(
  errors: AdminMessages["catalog"]["errors"],
  key: string | null,
): string | null {
  if (!key) {
    return null;
  }

  return errors[key as keyof AdminMessages["catalog"]["errors"]] ?? errors.unknown;
}

export function OfferRowsForm({
  locale,
  messages,
  errors,
  offerTypes,
  gameId,
  offers,
}: OfferRowsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasOffers = offers.length > 0;
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // React suppresses synthetic events during its action-triggered reset. A
    // native listener preserves edits made while the request was pending.
    const preserveDrafts = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveDrafts);
    return () => form.removeEventListener("reset", preserveDrafts);
  }, [hasOffers]);
  const [state, formAction, pending] = useActionState<OfferRowsState, FormData>(
    async (previous, formData) => {
      const serverPrices = new Map(offers.map((offer) => [offer.id, offer.price]));
      const submittedPrices: Record<string, SavedOfferPrice> = {};
      formData.getAll("offerIds").forEach((id, index) => {
        if (typeof id !== "string" || !serverPrices.has(id)) return;
        submittedPrices[id] = { price: Number(formData.get(`offers.${index}.price`)), previousServerPrice: serverPrices.get(id)! };
      });
      const result = await updateOffersAction({ error: previous.error, notice: previous.notice }, formData);
      return { ...result, savedPrices: !result.error && result.notice === "saved" ? submittedPrices : previous.savedPrices };
    },
    { ...INITIAL_CATALOG_STATE, savedPrices: {} },
  );

  const pricingOptions = PRICING_MODE_ORDER.map((mode) => ({
    value: mode,
    label: messages.pricingModes[mode],
  }));

  if (offers.length === 0) {
    return (
      <AdminCard title={messages.title} description={messages.description}>
        <EmptyState title={messages.emptyTitle} description={messages.emptyDescription} />
      </AdminCard>
    );
  }

  return (
    <AdminCard title={messages.title} description={messages.description}>
      <form ref={formRef} action={formAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="gameId" value={gameId} />

        <ul className="grid gap-3">
          {offers.map((offer, index) => {
            const cost = offer.supplierCostUsd;

            return (
              <li
                key={offer.id}
                className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <input type="hidden" name="offerIds" value={offer.id} />

                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
                    {offer.slug}
                  </span>
                  <Badge tone="neutral">
                    {offerTypes[offer.offerType as keyof CatalogMessages["offerTypes"]] ??
                      offer.offerType}
                  </Badge>
                  {offer.deliveryKind === "direct" ? (
                    <Badge tone="success">{messages.deliveryKindDirect}</Badge>
                  ) : offer.deliveryKind === "account" ? (
                    <Badge tone="accent">{messages.deliveryKindAccount}</Badge>
                  ) : null}
                  <span className={READ_ONLY_VALUE_CLASSES}>
                    {messages.cost}:{" "}
                    <span dir="ltr">
                      {cost === null ? "—" : formatPrice(cost, "USD", locale)}
                    </span>
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField
                    label={messages.nameAr}
                    name={`offers.${index}.nameAr`}
                    defaultValue={offer.nameAr}
                    required
                    maxLength={160}
                  />
                  <TextField
                    label={messages.nameEn}
                    name={`offers.${index}.nameEn`}
                    defaultValue={offer.nameEn}
                    required
                    maxLength={160}
                    dir="ltr"
                  />
                  <TextAreaField
                    label={messages.descriptionAr}
                    hint={messages.descriptionHint}
                    name={`offers.${index}.descriptionAr`}
                    defaultValue={offer.descriptionAr ?? ""}
                    maxLength={4000}
                    rows={3}
                  />
                  <TextAreaField
                    label={messages.descriptionEn}
                    hint={messages.descriptionHint}
                    name={`offers.${index}.descriptionEn`}
                    defaultValue={offer.descriptionEn ?? ""}
                    maxLength={4000}
                    rows={3}
                    dir="ltr"
                  />
                  <OfferPriceField
                    offerId={offer.id}
                    locale={locale}
                    messages={messages}
                    name={`offers.${index}.price`}
                    price={offer.price}
                    savedSubmission={state.savedPrices[offer.id]}
                    pending={pending}
                    currency={offer.currency}
                    supplierCostUsd={cost}
                  />
                  <TextField
                    label={messages.originalPrice}
                    name={`offers.${index}.originalPrice`}
                    type="number"
                    min={0}
                    step={0.01}
                    defaultValue={offer.originalPrice ?? ""}
                    dir="ltr"
                    className="tabular-nums"
                  />
                  <SelectField
                    label={messages.pricingMode}
                    hint={messages.pricingHint}
                    name={`offers.${index}.pricingMode`}
                    defaultValue={offer.pricingMode}
                    options={pricingOptions}
                  />
                  <TextField
                    label={messages.sortOrder}
                    name={`offers.${index}.sortOrder`}
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={offer.sortOrder}
                    required
                    dir="ltr"
                    className="tabular-nums"
                  />
                  <CheckboxField
                    label={messages.isSale}
                    name={`offers.${index}.isSale`}
                    defaultChecked={offer.isSale}
                    className="self-end"
                  />
                  <CheckboxField
                    label={messages.isActive}
                    name={`offers.${index}.isActive`}
                    defaultChecked={offer.isActive}
                    className="self-end"
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <FormResult
          error={resolveError(errors, state.error)}
          notice={state.notice === "saved" ? messages.saved : null}
        />

        <div>
          <Button type="submit" disabled={pending}>
            {messages.saveAction}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}
