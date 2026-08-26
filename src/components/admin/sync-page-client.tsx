"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, CableIcon, SyncIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

export type SyncProviderLane = {
  key: string;
  title: string;
  description: string;
  configured: boolean;
  configuredLabel: string;
  notConfiguredLabel: string;
  configureHint: string;
  importHref: string;
  importedCount: number | null;
  availableCount: number | null;
  importedLabel: string;
  availableLabel: string;
  goToImportLabel: string;
};

export type SyncPageClientProps = {
  locale: Locale;
  messages: AdminMessages["sync"];
  providers: SyncProviderLane[];
};

export function SyncPageClient({ locale, messages, providers }: SyncPageClientProps) {
  const [activeKey, setActiveKey] = useState(providers[0]?.key ?? "");

  const active = providers.find((p) => p.key === activeKey) ?? providers[0];

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((provider) => {
          const isActive = provider.key === activeKey;

          return (
            <button
              key={provider.key}
              type="button"
              onClick={() => setActiveKey(provider.key)}
              className={cn(
                "grid gap-2 rounded-[var(--radius-card)] border p-4 text-start transition-colors duration-[var(--duration)]",
                isActive
                  ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]",
              )}
            >
              <div className="flex items-center gap-2">
                <CableIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
                <span className="truncate text-sm font-semibold text-[var(--ink)]">
                  {provider.title}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
                {provider.description}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone={provider.configured ? "success" : "neutral"}>
                  {provider.configured ? provider.configuredLabel : provider.notConfiguredLabel}
                </Badge>
                {provider.configured && provider.importedCount !== null ? (
                  <Badge tone="accent">{formatCount(provider.importedLabel, provider.importedCount)}</Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">{active.title}</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{active.description}</p>
            </div>
            {active.configured ? (
              <div className="flex flex-wrap items-center gap-3 text-sm tabular-nums">
                {active.importedCount !== null ? (
                  <span className="text-[var(--ink-muted)]">
                    {formatCount(active.importedLabel, active.importedCount)}
                  </span>
                ) : null}
                {active.availableCount !== null ? (
                  <span className="text-[var(--ink-muted)]">
                    {formatCount(active.availableLabel, active.availableCount)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {!active.configured ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className="text-sm text-[var(--ink-muted)]">{active.configureHint}</p>
              <Link
                href={`/${locale}/dashboard/providers`}
                className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
              >
                <CableIcon className="size-4" />
                {messages.notConfigured}
              </Link>
            </div>
          ) : (
            <div className="mt-6">
              <Link
                href={active.importHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] hover:opacity-90"
              >
                <SyncIcon className="size-4" />
                {active.goToImportLabel}
                <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}
