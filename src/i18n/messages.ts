import arCatalog from "@/i18n/messages/ar/catalog.json";
import arCommon from "@/i18n/messages/ar/common.json";
import arContent from "@/i18n/messages/ar/content.json";
import arHome from "@/i18n/messages/ar/home.json";
import arSearch from "@/i18n/messages/ar/search.json";
import enCatalog from "@/i18n/messages/en/catalog.json";
import enCommon from "@/i18n/messages/en/common.json";
import enContent from "@/i18n/messages/en/content.json";
import enHome from "@/i18n/messages/en/home.json";
import enSearch from "@/i18n/messages/en/search.json";
import type { Locale } from "@/i18n/config";

/**
 * Message dictionaries, split by domain namespace.
 *
 * Arabic is the source of truth for structure: the English dictionary is typed
 * against the Arabic shape, so adding a key to one locale but not the other
 * fails typechecking instead of rendering a missing string at runtime.
 */
const AR = {
  common: arCommon,
  catalog: arCatalog,
  home: arHome,
  search: arSearch,
  content: arContent,
};

type Dictionary = typeof AR;

const EN: Dictionary = {
  common: enCommon,
  catalog: enCatalog,
  home: enHome,
  search: enSearch,
  content: enContent,
};

const MESSAGES: Record<Locale, Dictionary> = {
  ar: AR,
  en: EN,
};

export type MessageNamespace = keyof Dictionary;
export type Messages<N extends MessageNamespace> = Dictionary[N];

export type CommonMessages = Messages<"common">;
export type CatalogMessages = Messages<"catalog">;
export type HomeMessages = Messages<"home">;
export type SearchMessages = Messages<"search">;
export type ContentMessages = Messages<"content">;

export function getMessages<N extends MessageNamespace>(locale: Locale, namespace: N): Messages<N> {
  return MESSAGES[locale][namespace];
}

export function getCommonMessages(locale: Locale): CommonMessages {
  return getMessages(locale, "common");
}

/**
 * Fill `{placeholder}` slots in a message.
 *
 * Numbers are formatted for the locale, so a count renders with the digits that
 * locale expects rather than being stringified raw.
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
