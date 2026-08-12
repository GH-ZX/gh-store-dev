import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CommonMessages } from "@/i18n/messages";

type FoundationHomeProps = {
  messages: CommonMessages;
};

export function FoundationHome({ messages }: FoundationHomeProps) {
  const foundations = [
    { label: messages.foundation.runtime, value: messages.foundation.runtimeValue },
    { label: messages.foundation.data, value: messages.foundation.dataValue },
    { label: messages.foundation.direction, value: messages.foundation.directionValue },
  ];

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_70%_0%,color-mix(in_srgb,var(--accent)_15%,transparent),transparent_62%)]" />
      <section className="relative mx-auto grid min-h-[min(760px,calc(100dvh-4.5rem))] w-full max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:py-20">
        <div className="max-w-2xl">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            {messages.foundation.eyebrow}
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[var(--ink)] sm:text-7xl">
            {messages.foundation.title}
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[var(--ink-soft)] sm:text-lg">
            {messages.foundation.description}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button type="button">{messages.foundation.primaryAction}</Button>
            <Link href="games" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface)]">
              {messages.foundation.secondaryAction}
            </Link>
          </div>
        </div>

        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]/70" />
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-5">
            <span className="text-sm font-semibold text-[var(--ink)]">{messages.foundation.buildStatus}</span>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">{messages.foundation.online}</span>
          </div>
          <div className="mt-6 grid gap-3">
            {foundations.map((item) => (
              <div key={item.label} className="grid gap-1 rounded-xl border border-[var(--line)] bg-[var(--canvas-raised)] p-4">
                <span className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">{item.label}</span>
                <span className="text-sm font-medium text-[var(--ink-soft)]">{item.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs leading-5 text-[var(--ink-muted)]">{messages.foundation.note}</p>
        </Card>
      </section>
    </div>
  );
}
