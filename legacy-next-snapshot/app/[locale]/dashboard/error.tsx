"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

/**
 * Copy is inlined instead of read from `@/i18n/messages`.
 *
 * An error boundary is a client component and gets no props from the server, so
 * the only way to translate it through the message barrel is a runtime
 * `getMessages` call — and that single reference keeps the whole `MESSAGES`
 * table reachable, dragging every locale dictionary (~239KB of JSON, `ar/admin`
 * alone being 84KB) into the browser bundle for the sake of three strings. The
 * duplication is deliberate and cheap: these strings must render when the rest
 * of the dashboard has already failed, so having them literally present here is
 * arguably more robust than resolving them through a bundle.
 */
const COPY = {
  ar: {
    title: "تعذر تحميل البيانات",
    description: "حاول تحديث الصفحة بعد قليل.",
    retry: "أعد المحاولة",
  },
  en: {
    title: "We could not load this",
    description: "Please refresh the page in a moment.",
    retry: "Try again",
  },
} as const;

export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname() ?? "";
  const locale = pathname.split("/")[1] === "ar" ? "ar" : "en";
  const copy = COPY[locale];

  return (
    <Section spacing="page">
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-[var(--radius-shell)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-6 py-12 text-center"
      >
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink)]">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{copy.description}</p>
        </div>
        <Button type="button" variant="secondary" onClick={retry}>
          {copy.retry}
        </Button>
      </div>
    </Section>
  );
}
