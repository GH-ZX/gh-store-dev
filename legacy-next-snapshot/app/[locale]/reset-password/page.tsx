import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Eyebrow } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");

  return buildPageMetadata({
    locale,
    path: "/reset-password",
    title: messages.recovery.resetTitle,
    description: messages.recovery.resetDescription,
    // The landing page of a recovery link must never be indexed.
    noIndex: true,
  });
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");
  const authMessages = getMessages(locale, "admin").auth;
  const common = getMessages(locale, "common");

  return (
    <Section spacing="page" mesh>
      <div className="mx-auto w-full max-w-md">
        <Eyebrow>{messages.recovery.eyebrow}</Eyebrow>
        <h1 className="mt-5 text-[clamp(1.875rem,4.5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-[var(--ink)]">
          {messages.recovery.resetTitle}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.recovery.resetDescription}
        </p>

        <div className="mt-8 rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-8">
          {/*
            The recovery token arrives in the URL fragment, so the session can
            only be established in the browser — the whole panel is client-side.
          */}
          <ResetPasswordForm
            locale={locale}
            messages={messages}
            authMessages={authMessages}
            loadingLabel={common.states.loading}
          />
        </div>
      </div>
    </Section>
  );
}
