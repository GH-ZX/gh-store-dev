import type { Locale } from "@/i18n/config";

/**
 * Price formatting.
 *
 * Arabic prices use Latin digits (`-u-nu-latn`): Arabic-Indic numerals are
 * correct Arabic, but every storefront and payment receipt in the target market
 * shows Latin digits, and a mismatch between the two is worse than either.
 */
const NUMBER_LOCALE: Record<Locale, string> = {
  ar: "ar-SY-u-nu-latn",
  en: "en-US",
};

function currencyFormatter(locale: Locale, currency: string): Intl.NumberFormat {
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  };

  try {
    return new Intl.NumberFormat(NUMBER_LOCALE[locale], options);
  } catch {
    // `narrowSymbol` is unsupported on some runtimes, and an unknown currency
    // code from provider data must not crash a product page.
    return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  }
}

export function formatPrice(amount: number, currency: string, locale: Locale): string {
  try {
    return currencyFormatter(locale, currency).format(amount);
  } catch {
    return `${formatNumber(amount, locale)} ${currency}`;
  }
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(value);
}

/** Lowest price in a set of offers, for a "from {price}" label. */
export function lowestPrice<T extends { price: number }>(offers: T[]): T | null {
  return offers.reduce<T | null>(
    (lowest, offer) => (lowest === null || offer.price < lowest.price ? offer : lowest),
    null,
  );
}
