import ar from "@/i18n/messages/ar/common.json";
import en from "@/i18n/messages/en/common.json";
import type { Locale } from "@/i18n/config";

export type CommonMessages = typeof ar;

export function getCommonMessages(locale: Locale): CommonMessages {
  return locale === "ar" ? ar : en;
}
