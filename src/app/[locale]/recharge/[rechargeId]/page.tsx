import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RechargeRequestPanel } from "@/components/recharge/recharge-request-panel";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { getMethodLabel } from "@/lib/settings/recharge-settings";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import {
  getMyRechargeRequest,
  getRechargeConfig,
} from "@/lib/services/recharge.service";
import { getMyWallet } from "@/lib/services/wallet.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Statuses a customer can still move: the page polls while one of these. */
const OPEN_STATUSES = new Set(["pending", "payment_sent", "processing"]);

/**
 * One manual recharge request, from the customer's side.
 *
 * A manual request is reviewed and credited by the store rather than by a
 * payment provider, so this page cannot follow a third party to its outcome. It
 * re-renders itself on a timer while the request is open and shows the result
 * once it settles: the credited amount and the full current balance when
 * approved, or the rejection and its note when declined. Auth and ownership are
 * enforced inside `getMyRechargeRequest`, so somebody else's request reads as
 * not found.
 */
export default async function RechargeRequestPage({
  params,
}: PageProps<"/[locale]/recharge/[rechargeId]">) {
  const locale = await resolveLocaleParam(params);
  const { rechargeId } = await params;
  const recharge = getMessages(locale, "recharge");

  const [request, wallet, config] = await Promise.all([
    getMyRechargeRequest(rechargeId),
    getMyWallet(),
    getRechargeConfig(),
  ]);

  if (!request) {
    notFound();
  }

  const open = OPEN_STATUSES.has(request.status);
  const method = config.methods.find((candidate) => candidate.id === request.paymentMethod);
  const methodLabel = method ? getMethodLabel(method, locale) : request.paymentMethod;

  return (
    <Section spacing="page" mesh>
      <nav>
        <Link
          href={`/${locale}/recharge`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {recharge.invoice.backToRecharge}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        eyebrow={recharge.eyebrow}
        title={recharge.request.title}
        className="mt-5"
      />

      <div className="mx-auto mt-8 w-full max-w-2xl">
        <RechargeRequestPanel
          locale={locale}
          messages={recharge}
          request={request}
          open={open}
          approved={request.status === "approved"}
          balance={wallet?.balance ?? 0}
          currency={wallet?.currency ?? "USD"}
          methodLabel={methodLabel}
        />
      </div>
    </Section>
  );
}