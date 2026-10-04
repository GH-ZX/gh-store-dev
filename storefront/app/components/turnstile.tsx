import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      ready: (callback: () => void) => void;
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          theme?: "auto" | "light" | "dark";
          language?: string;
          appearance?: "always" | "execute" | "interaction-only";
          "response-field"?: boolean;
          "response-field-name"?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: (errorCode?: string) => void;
          [key: string]: unknown;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptLoadingPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile script")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

export type TurnstileProps = {
  siteKey?: string | null;
  action?: string;
  locale?: string;
  theme?: "auto" | "light" | "dark";
  resetKey?: unknown;
  onSuccess?: (token: string) => void;
  onError?: () => void;
  className?: string;
};

export function Turnstile({
  siteKey,
  action,
  locale = "ar",
  theme = "auto",
  resetKey,
  onSuccess,
  onError,
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  // If Turnstile is unconfigured or disabled, render nothing
  if (!siteKey) {
    return null;
  }

  useEffect(() => {
    let isCancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (isCancelled || !containerRef.current || !window.turnstile) return;

        // Clean up any previous widget in this container before re-rendering
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // Ignore removal errors
          }
          widgetIdRef.current = null;
        }

        const renderWidget = () => {
          if (isCancelled || !containerRef.current || !window.turnstile) return;

          try {
            const options: Record<string, unknown> = {
              sitekey: siteKey,
              theme,
              language: locale === "ar" ? "ar" : "en",
              "response-field": false,
              callback: (newToken: string) => {
                if (!isCancelled) {
                  setToken(newToken);
                  onSuccess?.(newToken);
                }
              },
              "expired-callback": () => {
                if (!isCancelled) {
                  setToken("");
                }
              },
              "error-callback": () => {
                if (!isCancelled) {
                  setToken("");
                  onError?.();
                }
              },
            };
            if (action) {
              options.action = action;
            }
            const widgetId = window.turnstile.render(
              containerRef.current,
              options as any,
            );
            widgetIdRef.current = widgetId;
          } catch {
            // Safe fallback if render fails
          }
        };

        if (typeof window.turnstile.ready === "function") {
          window.turnstile.ready(renderWidget);
        } else {
          renderWidget();
        }
      })
      .catch(() => {
        // Fail gracefully if Turnstile script is blocked by an adblocker
      });

    return () => {
      isCancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, locale, theme, action]);

  // When resetKey changes (e.g. form error returned), reset widget and clear token
  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // Ignore
      }
      setToken("");
    }
  }, [resetKey]);

  return (
    <div
      className={className ?? "flex min-h-[65px] items-center justify-center"}
    >
      <input
        type="hidden"
        name="cf-turnstile-response"
        value={token}
      />
      <div
        ref={containerRef}
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-action={action}
      />
    </div>
  );
}
