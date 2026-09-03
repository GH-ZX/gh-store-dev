"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin bar along the top while a navigation is in flight.
 *
 * A root `loading.tsx` would do this too, but it makes Next stream the shell
 * before the page decides anything, so a redirect to sign-in and a 404 both
 * leave the server as 200 — and a 200 "not found" is then cacheable. This
 * shows on the click instead and goes away when the URL actually changes, so
 * the server keeps its real status codes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const [seen, setSeen] = useState(`${pathname}?${search}`);
  const location = `${pathname}?${search}`;

  // The URL changed: the navigation that lit the bar has landed.
  if (location !== seen) {
    setSeen(location);
    setActive(false);
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest("a[href]");

      if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";

      if (!href.startsWith("/") || href.startsWith("//")) {
        return;
      }

      const current = `${window.location.pathname}${window.location.search}`;

      if (href === current || href.startsWith("#")) {
        return;
      }

      setActive(true);
    };

    const onSubmit = () => setActive(true);

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={
        active
          ? "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 origin-left animate-[gh-progress_1.2s_ease-out_forwards] bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
          : "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 scale-x-0 bg-transparent"
      }
    />
  );
}
