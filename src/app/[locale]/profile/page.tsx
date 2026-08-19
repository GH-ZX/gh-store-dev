import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm, ProfileForm } from "@/components/account/profile-forms";
import { WalletSummaryPanel } from "@/components/account/wallet-panels";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ButtonLink } from "@/components/ui/button";
import { GamepadIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMyProfile } from "@/lib/services/profile.service";
import { getMyWallet } from "@/lib/services/wallet.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");
  const common = getMessages(locale, "common");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/profile`)}`);
  }

  const profile = await getMyProfile();

  if (!profile) {
    return (
      <Section spacing="page">
        <ErrorState title={common.states.errorTitle} description={common.states.errorDescription} />
      </Section>
    );
  }

  /*
   * A suspended account sees why and nothing else. Rendering the editable forms
   * would invite a customer to change details on an account that cannot be used.
   */
  if (!profile.isActive) {
    return (
      <Section spacing="page" mesh>
        <SectionHeader as="h1" eyebrow={messages.eyebrow} title={messages.banned.title} />
        <ErrorState
          className="mt-8"
          title={messages.banned.title}
          description={messages.banned.description}
          action={{ href: `/${locale}/contact`, label: common.links.contact }}
        />
      </Section>
    );
  }

  // The admin has no customer wallet; the wallet panel would show a zero balance
  // that means nothing to someone whose purchases are gift orders.
  const wallet = session.isAdmin ? null : await getMyWallet();

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-6">
          <ProfileForm
            locale={locale}
            messages={messages}
            fullName={profile.fullName}
            username={profile.username}
            email={profile.email}
          />
          <PasswordForm locale={locale} messages={messages} />
        </div>

        <div className="grid gap-6">
          {wallet ? (
            <WalletSummaryPanel
              locale={locale}
              messages={messages}
              wallet={wallet}
              detailHref={`/${locale}/wallet`}
              rechargeHref={`/${locale}/recharge`}
            />
          ) : null}

          <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">{messages.orders.title}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              {messages.orders.description}
            </p>

            <EmptyState
              className="mt-5"
              icon={<GamepadIcon />}
              title={messages.orders.emptyTitle}
              description={messages.orders.emptyDescription}
            />

            <div className="mt-5 grid gap-2">
              <ButtonLink href={`/${locale}/orders`} variant="secondary" fullWidth>
                {messages.orders.title}
              </ButtonLink>
              <ButtonLink href={`/${locale}/games`} variant="ghost" fullWidth>
                {messages.orders.browseAction}
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
