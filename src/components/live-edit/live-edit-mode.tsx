"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";

/**
 * Whether the owner is editing the page they are looking at.
 *
 * A context rather than a prop threaded through the tree, because everything
 * between the toggle and a pencil is a server component: the sections, the
 * grids and the cards render on the server and cannot pass client state down.
 * Each pencil is its own client island reading this.
 *
 * Off by default, every visit. Edit mode changes what a click does — a card
 * opens a panel instead of the game — so leaving it on across navigations would
 * eventually surprise the person who forgot they turned it on.
 */
const LiveEditContext = createContext(false);

export function useLiveEdit(): boolean {
  return useContext(LiveEditContext);
}

export type LiveEditModeProps = {
  messages: AdminMessages["liveEdit"];
  locale: Locale;
  children: ReactNode;
};

export function LiveEditMode({ messages, locale, children }: LiveEditModeProps) {
  const [editing, setEditing] = useState(false);

  return (
    <LiveEditContext.Provider value={editing}>
      {children}

      {/*
        * Fixed to the bottom of the viewport, over everything, on the side the
        * language ends on. It has to stay reachable while scrolling — the
        * heading being edited may be a screen away from the one that started
        * it — and it must not sit under the mobile drawer's own controls.
        */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6">
        <div className="pointer-events-auto flex items-center gap-3 rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--shell)_92%,transparent)] py-2 ps-4 pe-2 shadow-[var(--elevation-3)] backdrop-blur-xl">
          {editing ? (
            <Link
              href={`/${locale}/dashboard/catalog`}
              className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] text-[var(--accent)] backdrop-blur-md transition-colors duration-[var(--duration)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
              aria-label={messages.addProduct}
              title={messages.addProduct}
            >
              <PlusIcon className="size-4" />
            </Link>
          ) : null}
          <p className="hidden text-xs text-[var(--ink-faint)] sm:block">{messages.toggleHint}</p>
          <Button
            type="button"
            variant={editing ? "primary" : "secondary"}
            onClick={() => setEditing((current) => !current)}
            aria-pressed={editing}
          >
            {editing ? messages.toggleOff : messages.toggleOn}
          </Button>
        </div>
      </div>
    </LiveEditContext.Provider>
  );
}
