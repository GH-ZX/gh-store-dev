import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Eyebrow } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");

  return buildPageMetadata({
    locale,
    path: "/forgot-password",
    title: messages.recovery.requestTitle,
    description: messages.recovery.requestDescription,
    // A recovery form has no place in search results.
    noIndex: true,
  });
}

export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[locale]/forgot-password">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");
  const authMessages = getMessages(locale, "admin").auth;

  return (
    <Section spacing="page" mesh>
      <div className="mx-auto w-full max-w-md">
        <Eyebrow>{messages.recovery.eyebrow}</Eyebrow>
        <h1 className="mt-5 text-[clamp(1.875rem,4.5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-[var(--ink)]">
          {messages.recovery.requestTitle}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.recovery.requestDescription}
        </p>

        <div className="mt-8 rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-8">
          <ForgotPasswordForm locale={locale} messages={messages} authMessages={authMessages} />
        </div>
      </div>
    </Section>
  );
}
