import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationList } from "@/components/account/notification-list";
import { EmptyState } from "@/components/shared/states";
import { BellIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMyNotifications } from "@/lib/services/notification.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NotificationsPage({ params }: PageProps<"/[locale]/notifications">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/notifications`)}`);
  }

  const notifications = await getMyNotifications(locale);

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.notifications.eyebrow}
        title={messages.notifications.title}
        subtitle={messages.notifications.description}
      />

      <div className="mt-10 max-w-2xl">
        {notifications.length === 0 ? (
          <EmptyState
            icon={<BellIcon />}
            title={messages.notifications.emptyTitle}
            description={messages.notifications.emptyDescription}
          />
        ) : (
          <NotificationList
            locale={locale}
            messages={messages.notifications}
            notifications={notifications}
          />
        )}
      </div>
    </Section>
  );
}
