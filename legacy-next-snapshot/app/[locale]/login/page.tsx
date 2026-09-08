import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Eyebrow } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");

  return buildPageMetadata({
    locale,
    path: "/login",
    title: messages.auth.signInTitle,
    description: messages.auth.signInDescription,
    // A sign-in form has no place in search results.
    noIndex: true,
  });
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");
  const query = await searchParams;
  const mode = query.mode === "sign-up" ? "sign-up" : "sign-in";
  const redirectTo = typeof query.next === "string" ? query.next : undefined;

  return (
    <Section spacing="page" mesh>
      <div className="mx-auto w-full max-w-md">
        <Eyebrow>{messages.auth.eyebrow}</Eyebrow>
        <h1 className="mt-5 text-[clamp(1.875rem,4.5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-[var(--ink)]">
          {mode === "sign-up" ? messages.auth.signUpTitle : messages.auth.signInTitle}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          {mode === "sign-up" ? messages.auth.signUpDescription : messages.auth.signInDescription}
        </p>

        <div className="mt-8 rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-8">
          <AuthForm
            locale={locale}
            messages={messages.auth}
            mode={mode}
            redirectTo={redirectTo}
            forgotPasswordLabel={getMessages(locale, "account").recovery.forgotLink}
          />
        </div>
      </div>
    </Section>
  );
}
