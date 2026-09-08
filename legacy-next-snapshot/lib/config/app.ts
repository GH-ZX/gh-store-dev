export const APP_NAME = "GH Store";

export const DEFAULT_LOCALE = "ar" as const;

export const SUPPORTED_LOCALES = ["ar", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
