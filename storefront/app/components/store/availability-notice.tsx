import { getMessages } from "@/i18n/messages";
import { formatMessage } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/**
 * Customer-facing availability truth for a product page.
 *
 * The catalog row is a snapshot; the supplier's stock is not. Rather than
 * showing a confident "in stock" that nobody verified, this states exactly what
 * was checked and when, and says plainly when it could not be checked. The
 * store's rule is "never swallow a provider failure", so an unverifiable check
 * is visible to the customer instead of being hidden behind a green label.
 *
 * Nothing here blocks a sale: an offer that is merely unverified stays
 * orderable, and checkout re-reads the live price and availability in the order
 * transaction. The component's job is to stop a shopper being surprised, not to
 * make the decision for them.
 *
 * The shape below mirrors the read-path service without importing from
 * `@server` — the server/client boundary in this app is a build boundary, so the
 * client component declares the fields it renders and the loader supplies them.
 */

export type AvailabilitySource =
  | "supplier-stock"
  | "catalogue-listing"
  | "stored-stock"
  | "provider-unreachable"
  | "not-checked";

export type AvailabilityEntry = {
  offerId: string;
  status: "available" | "unavailable" | "unknown";
  checkedAt: number | null;
  stale: boolean;
  source: AvailabilitySource;
  priceChanged: boolean;
};

export type AvailabilitySummary = {
  status: "available" | "unavailable" | "unknown" | "mixed";
  checkedAt: number | null;
  stale: boolean;
  priceChanged: boolean;
  sources: AvailabilitySource[];
};

/** Collapse per-offer results into the one statement the page can make. */
export function summariseAvailability(
  availability: Record<string, AvailabilityEntry> | undefined,
): AvailabilitySummary | null {
  const entries = Object.values(availability ?? {});
  if (entries.length === 0) return null;

  const statuses = new Set(entries.map((entry) => entry.status));
  const status: AvailabilitySummary["status"] =
    statuses.size === 1 ? entries[0].status : "mixed";
  const checked = entries.flatMap((entry) => (entry.checkedAt ? [entry.checkedAt] : []));

  return {
    status,
    checkedAt: checked.length > 0 ? Math.max(...checked) : null,
    stale: entries.some((entry) => entry.stale),
    priceChanged: entries.some((entry) => entry.priceChanged),
    sources: [...new Set(entries.map((entry) => entry.source))],
  };
}

function ageText(checkedAt: number, locale: Locale): string {
  const seconds = Math.max(0, Math.round((Date.now() - checkedAt) / 1000));
  if (seconds < 90) return locale === "ar" ? "قبل أقل من دقيقتين" : "less than two minutes ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return locale === "ar" ? `قبل ${minutes} دقيقة` : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  return locale === "ar" ? `قبل ${hours} ساعة` : `${hours} hours ago`;
}

export function AvailabilityNotice({
  availability,
  locale,
  className,
}: {
  availability: AvailabilitySummary | null;
  locale: Locale;
  className?: string;
}) {
  if (!availability) return null;
  const copy = getMessages(locale, "catalog").productDetail;

  const stored = availability.sources.length === 1 && availability.sources[0] === "stored-stock";
  const message = (() => {
    if (stored) return copy.availabilityStored;
    switch (availability.status) {
      case "unavailable":
        return copy.availabilityUnavailable;
      case "unknown":
        return copy.availabilityUnknown;
      case "mixed":
        // Some packages verified, some not: the weaker statement is the honest one.
        return copy.availabilityUnknown;
      default:
        return availability.stale && availability.checkedAt
          ? formatMessage(copy.availabilityStale, { age: ageText(availability.checkedAt, locale) })
          : copy.availabilityLive;
    }
  })();

  return (
    <div
      className={cn("sf-availability-notice", className)}
      data-availability={availability.status}
      data-availability-source={availability.sources.join(" ")}
      role="status"
    >
      <p className="sf-availability-message">{message}</p>
      {availability.priceChanged ? (
        <p className="sf-availability-price-changed">{copy.availabilityPriceChanged}</p>
      ) : null}
      <p className="sf-availability-price-note">{copy.priceConfirmedAtCheckout}</p>
    </div>
  );
}
