import type { Locale } from "@/i18n/config";

/**
 * Placeholder interpolation, deliberately kept away from the dictionaries.
 *
 * This lives in its own module because client components need it. Importing it
 * from `@/i18n/messages` dragged that module's eighteen static JSON imports —
 * roughly 240KB of raw dictionary, both locales, every namespace — into any
 * browser bundle that touched it. Bundlers can sometimes prove the dictionary
 * map is unused and drop it, but "sometimes" is not a bundle budget, and the
 * function has no need of the data anyway.
 *
 * `@/i18n/messages` re-exports this name, so server code that reaches for it
 * alongside `getMessages` keeps working.
 */
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
  locale?: Locale,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];

    if (value === undefined) {
      return match;
    }

    if (typeof value === "number") {
      return locale ? new Intl.NumberFormat(locale).format(value) : String(value);
    }

    return value;
  });
}
