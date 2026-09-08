"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyncIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { syncWalletAction } from "@/app/[locale]/dashboard/wallet-actions";

/**
 * Supplier wallet cards with one global sync.
 *
 * Balances shown on load come from the database cache, which is what keeps this
 * section instant. A refresh walks the suppliers one at a time and updates each
 * card as its own answer lands: these are slow third-party APIs on the far side
 * of a Worker, and asking all of them at once meant every request sat in the
 * same fetch queue while the page held its breath.
 */

export type WalletCardView = {
  key: string;
  provider: string;
  label: string;
  logo: "shamcash" | null;
  balances: { currency: string; amount: number }[];
  status: "ok" | "error" | "never";
  errorKind: string | null;
  syncedAt: string | null;
};

export type WalletCardsLabels = {
  syncAll: string;
  syncingAll: string;
  update: string;
  updating: string;
  lastSynced: string;
  neverSynced: string;
  failed: string;
};

/** Where a live brand mark can be pulled from, per provider. */
const BRAND_ICONS: Record<string, string> = {
  g2bulk: "https://www.google.com/s2/favicons?domain=g2bulk.com&sz=64",
  maxstore: "https://www.google.com/s2/favicons?domain=maxstore1.com&sz=64",
  batstore: "https://www.google.com/s2/favicons?domain=t.me&sz=64",
  "sam:syriatel": "https://www.google.com/s2/favicons?domain=syriatel.com&sz=64",
};

/** Money reads best symbol-last and locked left-to-right, whatever the page says. */
function formatBalance(currency: string, amount: number): string {
  const fixed = amount.toFixed(2);

  return currency.toUpperCase() === "USD" ? `${fixed}$` : `${fixed} ${currency.toUpperCase()}`;
}

function BrandMark({ card }: { card: WalletCardView }) {
  const [broken, setBroken] = useState(false);
  const iconUrl = BRAND_ICONS[card.logo === "shamcash" ? "__local__" : card.provider] ?? BRAND_ICONS[`${card.provider}:${card.label.toLowerCase()}`];

  if (card.logo === "shamcash") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- store-owned brand asset
      <img src="/shamcash-logo.svg" alt="" width={28} height={28} />
    );
  }

  if (iconUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external favicon, not a build-time asset
      <img
        src={iconUrl}
        alt=""
        width={26}
        height={26}
        className="rounded-[4px]"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span className="text-sm font-bold text-[var(--accent-strong)]" aria-hidden="true">
      {initials(card.label)}
    </span>
  );
}

/**
 * A cached balance older than this is auto-refreshed on mount.
 *
 * Only balances that previously succeeded qualify. A failed card is left for an
 * explicit press — auto-retrying it looped forever, because a failure writes
 * `status: "error"`, an errored card always counts as stale, and the retry
 * failed the same way on the next load.
 */
const STALE_AFTER_MS = 5 * 60_000;

/**
 * Marks the automatic pass as spent for the tab, not just for the mount.
 *
 * `template.tsx` remounts this subtree on every navigation, so a `useRef` guard
 * reset each time an admin moved between dashboard pages and the automatic sync
 * fired again and again.
 */
const AUTO_SYNC_FLAG = "gh-store:wallet-auto-sync";

export function WalletCards({
  cards,
  locale,
  labels,
  embedded = false,
}: {
  cards: WalletCardView[];
  locale: Locale;
  labels: WalletCardsLabels;
  /**
   * Rendered inside a provider's own section on the API page: the cards are
   * already where they point, so they are plain panels — not links — and the
   * update control is always shown, even for a single wallet.
   */
  embedded?: boolean;
}) {
  const [overrides, setOverrides] = useState<
    Record<string, { balances: { currency: string; amount: number }[]; syncedAt: string; failed?: boolean }>
  >({});
  const [syncing, setSyncing] = useState(false);
  const [, startTransition] = useTransition();
  /** Guards the automatic first pass so it runs once per mount, not per render. */
  const autoRan = useRef(false);

  async function syncSubset(subset: WalletCardView[]) {
    setSyncing(true);

    try {
      /*
       * Sequential on purpose. Each of these is a separate third-party API,
       * several of them slow, and a Worker gives every outbound request the same
       * limited concurrency: firing them together did not make the answers
       * arrive sooner, it just made all of them late at once and risked the
       * request's wall-clock budget. One at a time also lets each card fill in
       * as soon as its own supplier replies.
       */
      for (const card of subset) {
        let update: {
          balances: { currency: string; amount: number }[];
          syncedAt: string;
          failed?: boolean;
        };

        try {
          const result = await syncWalletAction(card.key);

          update = result.ok
            ? { balances: result.balances, syncedAt: result.syncedAt }
            : { balances: [], syncedAt: new Date().toISOString(), failed: true };
        } catch {
          // A dead supplier must not strand the cards queued behind it.
          update = { balances: [], syncedAt: new Date().toISOString(), failed: true };
        }

        setOverrides((current) => ({ ...current, [card.key]: update }));
      }
    } finally {
      startTransition(() => setSyncing(false));
    }
  }

  /*
   * Automatic first sync.
   *
   * An admin who just signed in should see live numbers without having to ask,
   * so a balance that went stale refreshes itself once per tab. Cards that are
   * fresh, that never synced, or that failed are left alone: the first needs
   * nothing, and the other two are exactly the cases that used to turn this
   * effect into an unbounded retry loop on every dashboard visit.
   */
  useEffect(() => {
    if (autoRan.current || cards.length === 0) {
      return;
    }
    autoRan.current = true;

    if (sessionStorage.getItem(AUTO_SYNC_FLAG)) {
      return;
    }

    const stale = cards.filter((card) => {
      if (overrides[card.key] || card.status !== "ok" || !card.syncedAt) {
        return false;
      }

      return Date.now() - new Date(card.syncedAt).getTime() > STALE_AFTER_MS;
    });

    if (stale.length === 0) {
      return;
    }

    sessionStorage.setItem(AUTO_SYNC_FLAG, "1");

    // Deferred one tick so the mount paints from cache first; the refresh then
    // lands as its own update rather than cascading into the initial render.
    const timer = setTimeout(() => void syncSubset(stale), 0);

    return () => clearTimeout(timer);
    // Runs deliberately once per mount; the closure's cards are the server truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncAll() {
    await syncSubset(cards);
  }

  return (
    <div className="grid gap-3">
      {embedded || cards.length > 1 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={syncing}
            onClick={() => void syncAll()}
            leadingIcon={<SyncIcon className={syncing ? "animate-spin" : undefined} />}
          >
            {syncing ? (embedded ? labels.updating : labels.syncingAll) : embedded ? labels.update : labels.syncAll}
          </Button>
        </div>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2">
        {cards.map((card) => {
          const override = overrides[card.key];
          const balances = override?.balances ?? card.balances;
          const syncedAt = override?.syncedAt ?? card.syncedAt;
          const failed = override?.failed || (card.status === "error" && !override);

          return (
            <li key={card.key}>
              {embedded ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
                  <CardBody card={card} balances={balances} syncedAt={syncedAt} failed={failed} labels={labels} />
                </div>
              ) : (
                <Link
                  href={`/${locale}/dashboard/providers#${anchorFor(card.provider)}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3 transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)]"
                >
                  <CardBody card={card} balances={balances} syncedAt={syncedAt} failed={failed} labels={labels} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CardBody({
  card,
  balances,
  syncedAt,
  failed,
  labels,
}: {
  card: WalletCardView;
  balances: WalletCardView["balances"];
  syncedAt: string | null;
  failed: boolean;
  labels: WalletCardsLabels;
}) {
  return (
    <>
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)] bg-white">
        <BrandMark card={card} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--ink)]">
          {card.label}
        </span>
        {balances.length > 0 ? (
          <span className="block text-base font-bold text-[var(--accent-strong)] tabular-nums" dir="ltr">
            {balances.map((b) => formatBalance(b.currency, b.amount)).join(" · ")}
          </span>
        ) : failed ? (
          <Badge tone="neutral">{labels.failed}</Badge>
        ) : (
          <span className="block text-xs text-[var(--ink-faint)]">{labels.neverSynced}</span>
        )}
        {syncedAt ? (
          <span
            className="mt-0.5 block text-[10px] text-[var(--ink-faint)] tabular-nums"
            dir="ltr"
          >
            {labels.lastSynced} {syncedAt.slice(0, 16).replace("T", " ")}
          </span>
        ) : null}
      </span>
    </>
  );
}

function anchorFor(provider: string): string {
  switch (provider) {
    case "g2bulk":
      return "g2bulk";
    case "maxstore":
      return "maxstore";
    case "batstore":
      return "batstore";
    case "sam":
      return "sam";
    default:
      return "providers";
  }
}

function initials(label: string): string {
  const words = label.trim().split(/\s+/).slice(0, 2);

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "?";
}
