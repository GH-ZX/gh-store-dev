import arAccount from "@/i18n/messages/ar/account.json";
import arAdmin from "@/i18n/messages/ar/admin.json";
import arCatalog from "@/i18n/messages/ar/catalog.json";
import arCheckout from "@/i18n/messages/ar/checkout.json";
import arCommon from "@/i18n/messages/ar/common.json";
import arContent from "@/i18n/messages/ar/content.json";
import arHome from "@/i18n/messages/ar/home.json";
import arRecharge from "@/i18n/messages/ar/recharge.json";
import arSearch from "@/i18n/messages/ar/search.json";
import enAccount from "@/i18n/messages/en/account.json";
import enAdmin from "@/i18n/messages/en/admin.json";
import enCatalog from "@/i18n/messages/en/catalog.json";
import enCheckout from "@/i18n/messages/en/checkout.json";
import enCommon from "@/i18n/messages/en/common.json";
import enContent from "@/i18n/messages/en/content.json";
import enHome from "@/i18n/messages/en/home.json";
import enRecharge from "@/i18n/messages/en/recharge.json";
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
  admin: arAdmin,
  account: arAccount,
  catalog: arCatalog,
  checkout: arCheckout,
  home: arHome,
  recharge: arRecharge,
  search: arSearch,
  content: arContent,
};

type Dictionary = typeof AR;

const EN: Dictionary = {
  common: enCommon,
  admin: enAdmin,
  account: enAccount,
  catalog: enCatalog,
  checkout: enCheckout,
  home: enHome,
  recharge: enRecharge,
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
export type AdminMessages = Messages<"admin">;
export type AccountMessages = Messages<"account">;
export type CheckoutMessages = Messages<"checkout">;
export type RechargeMessages = Messages<"recharge">;

export function getMessages<N extends MessageNamespace>(locale: Locale, namespace: N): Messages<N> {
  return MESSAGES[locale][namespace];
}

export function getCommonMessages(locale: Locale): CommonMessages {
  return getMessages(locale, "common");
}

/*
 * Re-exported for server callers that want messages and interpolation from one
 * import. The implementation lives in `@/i18n/format`, which carries no JSON,
 * so a client component can reach for it without pulling every dictionary into
 * the browser bundle.
 */
export { formatMessage } from "@/i18n/format";
