import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/admin/dashboard-nav";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { signOutAction } from "@/lib/auth/actions";
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
    <div data-dashboard-shell className="gh-page py-8 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-4">
            <div className="flex items-center justify-between gap-2 px-3 pb-4">
              <span className="text-sm font-semibold text-[var(--ink)]">{messages.shell.title}</span>
            </div>

            <DashboardNav locale={locale} messages={messages.shell} />

            <div className="mt-6 grid gap-2 border-t border-[var(--line)] pt-4">
              <Link
                href={`/${locale}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
              >
                <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
                {messages.shell.backToStore}
              </Link>

              <form action={signOutAction}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="ghost" size="sm" fullWidth className="justify-start">
                  {messages.auth.signOutAction}
                </Button>
              </form>
            </div>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
