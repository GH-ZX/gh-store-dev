"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { PencilIcon, PlusIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

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
        * Floating edit toggle — a pen icon fixed to the bottom-end corner.
        * When active, expands to show a plus button for adding products and
        * a close button to exit edit mode.
        */}
      <div className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:end-6">
        {editing ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--shell)_92%,transparent)] px-2 py-1.5 shadow-[var(--elevation-3)] backdrop-blur-xl">
            <Link
              href={`/${locale}/dashboard/catalog`}
              className="grid size-8 place-items-center rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] text-[var(--accent)] backdrop-blur-md transition-colors duration-[var(--duration)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
              aria-label={messages.addProduct}
              title={messages.addProduct}
            >
              <PlusIcon className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="grid size-8 place-items-center rounded-full bg-[var(--danger)] text-white shadow-[var(--elevation-1)] transition-colors duration-[var(--duration)] hover:bg-[color-mix(in_srgb,var(--danger)_85%,black)]"
              aria-label={messages.toggleOff}
            >
              <span className="sr-only">{messages.toggleOff}</span>
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          aria-pressed={editing}
          aria-label={messages.toggleOn}
          title={messages.toggleHint}
          className={cn(
            "grid size-12 place-items-center rounded-full shadow-[var(--elevation-3)] backdrop-blur-xl transition-all duration-[var(--duration)]",
            editing
              ? "border-2 border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
              : "border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--shell)_92%,transparent)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
          )}
        >
          <PencilIcon className="size-5" />
        </button>
      </div>
    </LiveEditContext.Provider>
  );
}
