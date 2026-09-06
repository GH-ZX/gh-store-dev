import type { Locale } from "@/i18n/config";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

type MaintenanceSettings = Pick<
  PublicStoreSettings,
  "maintenanceMode" | "maintenanceMessageAr" | "maintenanceMessageEn"
>;

/**
 * Public maintenance presentation. This is not a mutation authorization gate:
 * the original application had no maintenance check in its server actions.
 * Keep sign-in and recovery available so an owner can always regain access.
 */
export function getMaintenanceNotice(
  settings: MaintenanceSettings,
  session: { isAdmin: boolean } | null,
  locale: Locale,
  pathname: string,
): { message: string } | null {
  const path = pathname.replace(/\.data$/, "").replace(/\/+$/, "");
  const authenticationPage = [
    "login",
    "forgot-password",
    "reset-password",
  ].some((page) => path === `/${locale}/${page}`);
  if (!settings.maintenanceMode || session?.isAdmin || authenticationPage)
    return null;
  const configured = (
    locale === "ar"
      ? settings.maintenanceMessageAr
      : settings.maintenanceMessageEn
  ).trim();
  return {
    message:
      configured ||
      (locale === "ar"
        ? "نجري بعض التحديثات على المتجر. يرجى العودة قريباً."
        : "We are updating the store. Please check back soon."),
  };
}
