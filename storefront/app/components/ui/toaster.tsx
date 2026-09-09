import { useEffect } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { getLocaleDirection, type Locale } from "@/i18n/config";

export interface AppToasterProps {
  locale: Locale;
}

export function AppToaster({ locale }: AppToasterProps) {
  const dir = getLocaleDirection(locale);
  useEffect(() => {
    let unmounted = false;
    const start = () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      window.removeEventListener("scroll", start);
      if (unmounted) return;
      import("@/lib/realtime-alerts")
        .then((mod) => {
          if (!unmounted) mod.subscribeToSiteAlerts();
        })
        .catch(() => {});
    };

    window.addEventListener("pointerdown", start, { passive: true, once: true });
    window.addEventListener("keydown", start, { passive: true, once: true });
    window.addEventListener("scroll", start, { passive: true, once: true });

    const idleTimer = setTimeout(start, 10000);

    return () => {
      unmounted = true;
      clearTimeout(idleTimer);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      window.removeEventListener("scroll", start);
    };
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
