import { useEffect } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { getLocaleDirection, type Locale } from "@/i18n/config";

export interface AppToasterProps {
  locale: Locale;
}

export function AppToaster({ locale }: AppToasterProps) {
  const dir = getLocaleDirection(locale);
  useEffect(() => {
    const timer = setTimeout(() => {
      import("@/lib/realtime-alerts")
        .then((mod) => {
          mod.subscribeToSiteAlerts();
        })
        .catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);


  return (
    <SonnerToaster
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        className: "gh-toast font-sans text-xs sm:text-sm",
        style: {
          borderRadius: "var(--radius-control, 8px)",
          fontFamily: "inherit",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
        },
      }}
    />
  );
}

export { toast } from "sonner";
