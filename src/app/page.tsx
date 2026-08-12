import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const foundations = [
  { label: "Runtime", value: "Next.js on Cloudflare Workers" },
  { label: "Data", value: "Hosted Supabase with RLS" },
  { label: "Direction", value: "Arabic-first, English-ready" },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_70%_0%,color-mix(in_srgb,var(--accent)_15%,transparent),transparent_62%)]" />
      <section className="relative mx-auto grid min-h-[min(760px,calc(100dvh-4.5rem))] w-full max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:py-20">
        <div className="max-w-2xl">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Foundation 01
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[var(--ink)] sm:text-7xl">
            Your next top-up should feel simple.
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[var(--ink-soft)] sm:text-lg">
            GH Store is rebuilding a faster, clearer home for game top-ups and digital goods.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button type="button">Explore the store</Button>
            <Link href="/games" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface)]">
              Browse games
            </Link>
          </div>
        </div>

        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]/70" />
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-5">
            <span className="text-sm font-semibold text-[var(--ink)]">Build status</span>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">Online</span>
          </div>
          <div className="mt-6 grid gap-3">
            {foundations.map((item) => (
              <div key={item.label} className="grid gap-1 rounded-xl border border-[var(--line)] bg-[var(--canvas-raised)] p-4">
                <span className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">{item.label}</span>
                <span className="text-sm font-medium text-[var(--ink-soft)]">{item.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs leading-5 text-[var(--ink-muted)]">
            The storefront shell is ready. Catalog and checkout arrive through the next vertical slices.
          </p>
        </Card>
      </section>
    </div>
  );
}
