"use client";

import { usePathname } from "next/navigation";
import { getMessages } from "@/i18n/messages";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname() ?? "";
  const locale = pathname.split("/")[1] === "ar" ? "ar" : "en";
  const common = getMessages(locale, "common");

  return (
    <Section spacing="page">
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-[var(--radius-shell)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] px-6 py-12 text-center"
      >
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink)]">{common.states.errorTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {common.states.errorDescription}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={retry}>
          {common.actions.retry}
        </Button>
      </div>
    </Section>
  );
}
