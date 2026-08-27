"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keep the order status current while a provider finishes in the background. */
export function OrderRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 5_000);

    return () => window.clearInterval(interval);
  }, [enabled, router]);

  return null;
}
