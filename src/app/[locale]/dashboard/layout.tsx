import { DashboardNav } from "@/components/admin/dashboard-nav";
import { ErrorState } from "@/components/shared/states";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { redirect } from "next/navigation";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth/guards";
import { resolveLocaleParam } from "@/lib/routing/locale-params";

/**
 * Dashboard shell.
 *
 * The guard runs in the layout so every page beneath it is protected by
 * construction — a new dashboard page cannot forget to check. A signed-out
 * visitor is sent to sign in with a return path; a signed-in non-admin gets an
 * explanation instead of a redirect loop.
 */
export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]/dashboard">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/dashboard`)}`);
    }

    if (!(error instanceof ForbiddenError)) {
      throw error;
    }

    return (
      <Section spacing="page">
        <ErrorState
          title={messages.shell.forbiddenTitle}
          description={messages.shell.forbiddenDescription}
          action={{ href: `/${locale}`, label: messages.shell.backToStore }}
        />
      </Section>
    );
  }

  return (
    // Marked so the stylesheet can keep the owner's ambient backdrop off a
    // working surface; the layer itself is rendered by the locale shell above.
    <div data-dashboard-shell className="gh-page py-6 sm:py-8">
      <DashboardNav
        locale={locale}
        messages={messages.shell}
        signOutLabel={messages.auth.signOutAction}
      />

      <div className="mt-6">{children}</div>
    </div>
  );
}
