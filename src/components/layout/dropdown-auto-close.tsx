"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Close the surrounding `details` once something inside it is used.
 *
 * A native disclosure has no idea the app navigated. The router replaces the
 * page without replacing this element, so a menu opened before a click stays
 * open on top of whatever arrives next, and the only way to dismiss it is to
 * find the summary again.
 *
 * Only an anchor or a button counts as "used" — selecting the email address in
 * the panel, or clicking its padding, should leave the menu where it is. The
 * route change is handled as well, so a link to a page reached some other way
 * still leaves the menu closed behind it.
 *
 * Rendered as a hidden marker rather than a wrapper so the disclosure keeps its
 * own layout, and so the menu itself stays a server component.
 */
export function DropdownAutoClose() {
  const marker = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const details = marker.current?.closest("details");

    if (!details) {
      return;
    }

    function close(event: Event) {
      const target = event.target as HTMLElement | null;

      if (target?.closest("a, button")) {
        details!.open = false;
      }
    }

    details.addEventListener("click", close);

    return () => details.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const details = marker.current?.closest("details");

    if (details) {
      details.open = false;
    }
  }, [pathname]);

  return <span ref={marker} hidden />;
}
