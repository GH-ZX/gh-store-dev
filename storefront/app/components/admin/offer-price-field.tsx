import { useState } from "react";
import { TextField } from "@/components/admin/admin-form";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { createOfferPriceDraft, editOfferPriceDraft, reconcileOfferPriceDraft, type SavedOfferPrice } from "@/lib/catalog/offer-price-draft";
import { supplierMarginUsd } from "@/lib/catalog/pricing";
import { formatPrice } from "@/lib/format/money";

/** Keep the preview beside the draft price so an operator can check it before saving. */
export function OfferPriceField({ offerId, name, price: savedPrice, savedSubmission, pending = false, currency, supplierCostUsd, locale, messages }: {
  offerId: string;
  name: string;
  price: number;
  savedSubmission?: SavedOfferPrice;
  pending?: boolean;
  currency: string;
  supplierCostUsd: number | null;
  locale: Locale;
  messages: Pick<AdminMessages["catalog"]["offers"], "price" | "margin" | "marginUnavailable" | "marginCurrencyHint">;
}) {
  const snapshot = { offerId, price: savedPrice, saved: savedSubmission, pending };
  const [draft, setDraft] = useState(() => createOfferPriceDraft(snapshot));
  const current = reconcileOfferPriceDraft(draft, snapshot);
  if (current !== draft) setDraft(current);
  const price = current.value;
  const margin = supplierMarginUsd(price.trim() ? Number(price) : Number.NaN, currency, supplierCostUsd);
  const incompatibleCurrency = currency.trim().toUpperCase() !== "USD" && supplierCostUsd !== null;
  return (
    <div className="grid content-start gap-2">
      <TextField label={messages.price} hint={currency} name={name} type="number" min={0} step={0.01} max={1000000}
        value={price} onChange={(event) => setDraft(editOfferPriceDraft(current, event.target.value, pending))} required dir="ltr" className="tabular-nums" />
      <output aria-live="polite" className={`text-xs tabular-nums ${margin !== null && margin < 0 ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"}`}>
        {messages.margin}: {margin === null ? messages.marginUnavailable : <bdi dir="ltr">{formatPrice(margin, "USD", locale)}</bdi>}
      </output>
      {incompatibleCurrency ? <p className="text-xs leading-5 text-[var(--ink-muted)]">{messages.marginCurrencyHint}</p> : null}
    </div>
  );
}
