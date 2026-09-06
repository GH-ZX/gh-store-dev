
import { useEffect } from "react";
import { useRevalidator } from "react-router";

/**
 * Keep an order page current while it is still being fulfilled.
 *
 * A fixed five-second `void revalidate()` re-rendered the page and its whole
 * layout — session, wallet, notification count, settings — forever, from one
 * open tab. Each refresh now waits a little longer than the last, tops out at
 * half a minute, stops entirely after ten minutes, and pauses while the tab is
 * hidden. Delivery usually lands within the first few ticks; a stuck order is
 * reconciled by the cron, not by a browser hammering the origin.
 */
const FIRST_DELAY_MS = 4_000;
const MAX_DELAY_MS = 30_000;
const GIVE_UP_AFTER_MS = 10 * 60_000;

export function OrderRefresh({ enabled }: { enabled: boolean }) {
  const { revalidate } = useRevalidator();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const startedAt = Date.now();
    let delay = FIRST_DELAY_MS;
    let timer: number | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        return;
      }

      timer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        if (document.visibilityState === "visible") {
          void revalidate();
          delay = Math.min(Math.round(delay * 1.5), MAX_DELAY_MS);
        }

        schedule();
      }, delay);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void revalidate();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    schedule();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [enabled, revalidate]);

  return null;
}
