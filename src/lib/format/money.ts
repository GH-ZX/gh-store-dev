import type { Locale } from "@/i18n/config";

/**
 * Price formatting.
 *
 * Arabic prices use Latin digits (`-u-nu-latn`): Arabic-Indic numerals are
 * correct Arabic, but every storefront and payment receipt in the target market
 * shows Latin digits, and a mismatch between the two is worse than either.
 *
 * The currency symbol is placed by hand rather than by `Intl`'s currency style.
 * For an Arabic locale, `Intl` renders USD as "US$" and puts it before the
 * number — "US$ 1.15" — which reads as clutter to a Syrian shopper. Formatting
 * the number with `Intl` and attaching a known symbol gives "$1.15" in English
 * and "1.15 $" in Arabic, which is what both audiences expect.
 */
const NUMBER_LOCALE: Record<Locale, string> = {
  ar: "ar-SY-u-nu-latn",
  en: "en-US",
};

/** Symbols for the currencies this store deals in; anything else shows its code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  AED: "AED",
  SAR: "SAR",
  SYP: "ل.س",
};

function amountFormatter(locale: Locale): Intl.NumberFormat {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPrice(amount: number, currency: string, locale: Locale): string {
  const code = currency?.trim().toUpperCase() || "USD";
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  const formatted = amountFormatter(locale).format(amount);

  // Arabic reads the amount first, then the symbol; English leads with a
  // single-character symbol and trails a multi-letter code.
  if (locale === "ar") {
    return `${formatted} ${symbol}`;
  }

  return symbol.length === 1 ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
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
