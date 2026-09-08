"use client";

import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

/**
 * Light/dark switch.
 *
 * Stateless by design. The applied theme lives in one place — the `data-theme`
 * attribute an inline script sets before first paint — and both the icon and the
 * accessible label follow it in CSS (`gh-only-dark` / `gh-only-light`). With no
 * React state mirroring the DOM there is nothing to get out of step during
 * hydration, and no flash of the wrong icon.
 */
export function ThemeToggle({
  labels,
}: {
  labels: { toggleLabel: string; dark: string; light: string };
}) {
  function toggle() {
    const root = document.documentElement;
    const next: ThemePreference = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the theme still applies for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={labels.toggleLabel}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] [&>svg]:size-[1.125rem]"
    >
      <SunIcon className="gh-only-dark" />
      <MoonIcon className="gh-only-light" />
      <span className="sr-only gh-only-dark">{labels.light}</span>
      <span className="sr-only gh-only-light">{labels.dark}</span>
    </button>
  );
}
