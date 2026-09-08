import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TelegramConnectPanel } from "@/components/account/telegram-connect-panel";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getPublicStoreSettings } from "@/lib/services/settings.service";
import { getMyTelegramLink } from "@/lib/services/telegram-link.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The Telegram connect page — where the bot's Sign-in button points.
 *
 * A signed-in customer lands here, gets a 6-digit code, and sends it to the
 * store's bot in Telegram. The bot consumes the code and links the chat to
 * this account; revisiting the page shows the connected state.
 */
export default async function TelegramConnectPage({ params }: PageProps<"/[locale]/telegram-connect">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/telegram-connect`)}`);
  }

  const [settings, telegramLink] = await Promise.all([
    getPublicStoreSettings(),
    getMyTelegramLink(),
  ]);

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.telegramConnect.eyebrow}
        title={messages.telegramConnect.title}
        subtitle={messages.telegramConnect.description}
      />

      <div className="mx-auto mt-10 max-w-xl">
        <TelegramConnectPanel
          locale={locale}
          messages={messages}
          linked={telegramLink.linked}
          chatLabel={telegramLink.chatLabel}
          linkedAt={telegramLink.linkedAt}
          botUsername={settings.telegramBotUsername}
        />
      </div>
    </Section>
  );
}
