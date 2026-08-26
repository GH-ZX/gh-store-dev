import "server-only";

import { cache } from "react";

import { requireAdmin } from "@/lib/auth/guards";
import { GRACE_MINUTES } from "@/lib/orders/reconciliation-policy";
import { withDeadline } from "@/lib/providers/deadline";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getBatStoreCredentials,
  getG2BulkCredentials,
  getMaxStoreCredentials,
  getSamCredentials,
} from "@/lib/services/admin-settings.service";
import { BatStoreClient } from "@/providers/batstore/client";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { SamClient } from "@/providers/sam/client";
import type { SamMethod } from "@/lib/settings/sam-settings";

/**
 * The overview's numbers.
 *
 * Every read runs behind {@link requireAdmin} on the caller's own session, and
 * the figures themselves come from `admin_overview_snapshot`, a security
 * definer function that refuses anyone without an active administrator profile
 * — so the database is the gate twice over. A figure that fails comes back as
 * null and renders as a dash: a misleading zero would read as "no sales today"
 * when the truth is "we could not check", and those two demand different
 * reactions from an owner.
 *
 * The external wallet reads are the one place this page reaches past the
 * database. Each is isolated and answers a failure kind instead of throwing,
 * so a supplier outage degrades one card to "unreachable" rather than taking
 * the whole morning's dashboard down with it.
 */

/*
 * One round trip for the whole page.
 *
 * The five readers below used to make roughly twenty PostgREST calls between
 * them: six head counts for the catalog line, four for the attention strip,
 * four for the KPIs, two full downloads of every paid order in a window so
 * JavaScript could add up one column, and a two-hundred-row read of the
 * payments screen whose only surviving output was a single integer. The
 * database sits about half a second away and answers each of those in under
 * three milliseconds — the page was almost entirely network, over a few hundred
 * rows.
 *
 * So Postgres does the arithmetic and React's `cache()` shares the one result
 * between all five readers, which the dashboard invokes together. The trade is
 * that a failure now darkens every panel instead of one, which is the honest
 * outcome anyway: they all wanted the same unreachable database.
 */

type CatalogCounters = {
  games: number;
  active_games: number;
  offers: number;
  active_offers: number;
  orders: number;
  customers: number;
};

type AttentionCounters = {
  stuck_orders: number;
  pending_recharges: number;
  open_support_threads: number;
  pending_reviews: number;
  payment_issues: number;
};

type SalesCounters = {
  revenue_today: number;
  revenue_7: number;
  revenue_prev_7: number;
  orders_7: number;
  new_customers_7: number;
};

/** Revenue against supplier cost for one window, before the "is it knowable" rule. */
type EarningsAggregate = { revenue: number; cost: number; unmapped_items: number };

type OverviewSnapshot = {
  catalog: CatalogCounters;
  attention: AttentionCounters;
  sales: SalesCounters;
  earnings: { week: EarningsAggregate; month: EarningsAggregate };
};

type DailySeriesPoint = { date: string; orders: number; revenue: number };

/*
 * `src/types/database.ts` is generated from the live schema and predates these
 * two functions, so `rpc()` does not know their names yet. Describing exactly
 * the two calls made here keeps their arguments and results type-checked
 * without hand-editing generated output; the next typegen run picks the
 * functions up and this can go.
 */
type OverviewRpcClient = {
  rpc(
    name: "admin_overview_snapshot",
    args: { p_grace_minutes: number },
  ): PromiseLike<{ data: OverviewSnapshot | null; error: unknown }>;
  rpc(
    name: "admin_daily_sales_series",
    args: { p_days: number },
  ): PromiseLike<{ data: DailySeriesPoint[] | null; error: unknown }>;
};

const readOverviewSnapshot = cache(async (): Promise<OverviewSnapshot | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as unknown as OverviewRpcClient).rpc(
    "admin_overview_snapshot",
    { p_grace_minutes: GRACE_MINUTES },
  );

  return error ? null : data;
});

export type AdminOverviewStats = {
  games: number | null;
  activeGames: number | null;
  offers: number | null;
  activeOffers: number | null;
  orders: number | null;
  customers: number | null;
};

/** Lifetime catalog counters, kept for the secondary line and the empty state. */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  await requireAdmin();
  const catalog = (await readOverviewSnapshot())?.catalog;

  return {
    games: catalog?.games ?? null,
    activeGames: catalog?.active_games ?? null,
    offers: catalog?.offers ?? null,
    activeOffers: catalog?.active_offers ?? null,
    orders: catalog?.orders ?? null,
    customers: catalog?.customers ?? null,
  };
}

// ─── Needs attention ────────────────────────────────────────────────────────

export type AttentionCounts = {
  /** Money taken, goods not out: paid/fulfilling/processing past the grace window. */
  stuckOrders: number | null;
  /** Manual top-ups waiting for the owner's decision. */
  pendingRecharges: number | null;
  /** Support threads not yet closed. */
  openSupportThreads: number | null;
  /** Reviews waiting for approval. */
  pendingReviews: number | null;
  /** Top-ups where money moved but the wallet did not (or the reverse). */
  paymentIssues: number | null;
};

/**
 * The attention strip.
 *
 * `paymentIssues` used to be read by asking the payments screen for its two
 * hundred newest top-ups, three nested embeds and a second query for the wallet
 * transactions behind them, reconciling all of it, and keeping one integer. The
 * same ladder now runs in `admin_overview_snapshot` against the same two
 * hundred rows, so the badge and the list it links to still agree.
 */
export async function getAttentionCounts(): Promise<AttentionCounts> {
  await requireAdmin();
  const attention = (await readOverviewSnapshot())?.attention;

  return {
    stuckOrders: attention?.stuck_orders ?? null,
    pendingRecharges: attention?.pending_recharges ?? null,
    openSupportThreads: attention?.open_support_threads ?? null,
    pendingReviews: attention?.pending_reviews ?? null,
    paymentIssues: attention?.payment_issues ?? null,
  };
}

// ─── Sales KPIs ─────────────────────────────────────────────────────────────

export type SalesKpis = {
  revenueToday: number | null;
  revenue7: number | null;
  revenuePrev7: number | null;
  orders7: number | null;
  newCustomers7: number | null;
  /** Average order value across the last seven days' paid orders. */
  avgOrder7: number | null;
};

export async function getSalesKpis(): Promise<SalesKpis> {
  await requireAdmin();
  const sales = (await readOverviewSnapshot())?.sales;

  if (!sales) {
    return {
      revenueToday: null,
      revenue7: null,
      revenuePrev7: null,
      orders7: null,
      newCustomers7: null,
      avgOrder7: null,
    };
  }

  return {
    revenueToday: sales.revenue_today,
    revenue7: sales.revenue_7,
    revenuePrev7: sales.revenue_prev_7,
    orders7: sales.orders_7,
    newCustomers7: sales.new_customers_7,
    avgOrder7: sales.orders_7 > 0 ? sales.revenue_7 / sales.orders_7 : null,
  };
}

// ─── Earnings (revenue against supplier cost) ───────────────────────────────

export type EarningsWindow = {
  revenue: number;
  cost: number | null;
  profit: number | null;
  /** Items whose offer carries no supplier mapping — manual catalog entries. */
  unmappedItems: number;
};

export type Earnings = { week: EarningsWindow; month: EarningsWindow };

export async function getEarnings(): Promise<Earnings | null> {
  await requireAdmin();
  const earnings = (await readOverviewSnapshot())?.earnings;

  if (!earnings) {
    return null;
  }

  const { week, month } = earnings;

  /*
   * One unknown cost breaks the guarantee behind a profit figure, so a window
   * containing manual-catalog items reports "not fully known" instead of a
   * number that flatters the store. The count tells the owner how far off a
   * full picture they are.
   */
  return {
    week: {
      revenue: week.revenue,
      cost: week.unmapped_items === 0 ? week.cost : null,
      profit: week.unmapped_items === 0 ? week.revenue - week.cost : null,
      unmappedItems: week.unmapped_items,
    },
    month: {
      revenue: month.revenue,
      cost: month.unmapped_items === 0 ? month.cost : null,
      profit: month.unmapped_items === 0 ? month.revenue - month.cost : null,
      unmappedItems: month.unmapped_items,
    },
  };
}

// ─── Fourteen-day series ────────────────────────────────────────────────────

export type DayPoint = { date: string; label: string; orders: number; revenue: number };

/**
 * Paid orders per day for the last `days` days, oldest first.
 *
 * Bucketed in UTC to match every timestamp the rest of the store keeps, and
 * zero-filled, so the bars read as a timeline rather than a list — both done by
 * the database now, which used to hand over every paid order in the window for
 * JavaScript to sort into fourteen buckets. It stays out of the snapshot above
 * because the day count belongs to the caller, and one shared result would have
 * to fix it first.
 */
export async function getDailySeries(days = 14): Promise<DayPoint[] | null> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase as unknown as OverviewRpcClient).rpc(
    "admin_daily_sales_series",
    { p_days: days },
  );

  if (error || !data) {
    return null;
  }

  return data.map((point) => ({
    date: point.date,
    label: point.date.slice(5),
    orders: point.orders,
    revenue: point.revenue,
  }));
}

// ─── Latest orders ──────────────────────────────────────────────────────────

export type LatestOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  itemName: string | null;
};

/** A handful of the newest orders, light columns only — the list page has the rest. */
export async function getLatestOrders(limit = 5): Promise<LatestOrder[] | null> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total, currency, created_at, order_items (name_en_snapshot)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return null;
  }

  return data.map((order) => {
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const first = items[0] as { name_en_snapshot?: string | null } | undefined;

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      total: typeof order.total === "number" ? order.total : 0,
      currency: order.currency,
      createdAt: order.created_at,
      itemName: first?.name_en_snapshot ?? null,
    };
  });
}

// ─── Supplier wallets ───────────────────────────────────────────────────────

export type WalletBalance = { currency: string; amount: number };

export type WalletCard = {
  /** Stable identity used by the cache table and the sync action. */
  key: string;
  provider: string;
  label: string;
  /** Brand mark available for this wallet, when one exists. */
  logo: "shamcash" | null;
  balances: WalletBalance[];
  status: "ok" | "error" | "never";
  errorKind: string | null;
  syncedAt: string | null;
};

const WALLET_TABLE = "provider_wallet_balances";

/**
 * Every wallet the enabled providers hold, painted from the local cache.
 *
 * This read makes **no supplier calls** — that is what keeps the overview
 * instant no matter how slow any supplier is feeling. Freshness is a press on
 * each card's own sync button, which re-asks exactly one API and updates one
 * row, because suppliers answer at different speeds and a bulk refresh would
 * hold the fastest hostage to the slowest.
 */
export async function getWalletCards(): Promise<WalletCard[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const skeletons = await buildWalletSkeletons();

  const { data: cached } = await supabase.from(WALLET_TABLE).select("*");
  const byKey = new Map<string, WalletRow>((cached ?? []).map((row) => [row.wallet_key, row as WalletRow]));

  return skeletons.map((skeleton) => {
    const row = byKey.get(skeleton.key);

    if (!row) {
      return { ...skeleton, status: "never", errorKind: null, syncedAt: null };
    }

    return {
      ...skeleton,
      balances: Array.isArray(row.balances)
        ? (row.balances as WalletBalance[]).filter(
            (entry) => typeof entry?.currency === "string" && typeof entry?.amount === "number",
          )
        : [],
      status: (row.status as WalletCard["status"]) ?? "ok",
      errorKind: row.error_kind ?? null,
      syncedAt: row.synced_at ?? null,
    };
  });
}

/**
 * How long a supplier may keep a balance read waiting.
 *
 * The provider clients retry three times with a fifteen-second timeout and
 * backoff, which is right for a purchase — abandoning one risks losing money
 * that has already moved — and wrong here. That budget runs to roughly
 * forty-six seconds for a single supplier, and Cloudflare ends the request at
 * thirty, so one unreachable supplier used to take the whole refresh down with
 * it and the owner saw a hung dashboard rather than a failed card.
 */
const BALANCE_DEADLINE_MS = 8_000;

/**
 * One balance source, freshly asked and immediately remembered.
 *
 * A supplier that does not answer inside {@link BALANCE_DEADLINE_MS} lands in
 * the catch below like any other failure, so the card reads "unreachable" and
 * the other cards keep their own timing.
 */
export async function syncWalletCard(key: string): Promise<
  | { ok: true; card: WalletCard }
  | { ok: false; errorKind: string }
> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  try {
    let card: WalletCard;

    if (key === "g2bulk") {
      const { apiKey, enabled } = await getG2BulkCredentials();
      if (!apiKey || !enabled) return { ok: false, errorKind: "missing_key" };

      // A balance is a read: nothing has moved, so there is nothing to lose by
      // giving up on it. The purchase paths keep their full retry budget.
      const account = await withDeadline("g2bulk", BALANCE_DEADLINE_MS, () =>
        new G2BulkClient({ apiKey }).getAccount(),
      );
      card = {
        key,
        provider: "g2bulk",
        label: account.username ?? account.first_name ?? "G2Bulk",
        logo: null,
        balances: [{ currency: "USD", amount: account.balance }],
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else if (key === "maxstore") {
      const { apiToken, enabled } = await getMaxStoreCredentials();
      if (!apiToken || !enabled) return { ok: false, errorKind: "missing_key" };

      // Same reasoning: a read may be abandoned, a purchase may not.
      const profile = await withDeadline("maxstore", BALANCE_DEADLINE_MS, () =>
        new MaxStoreClient({ apiToken }).getProfile(),
      );
      card = {
        key,
        provider: "maxstore",
        label: profile.username ?? "MaxStore",
        logo: null,
        balances: [{ currency: "USD", amount: profile.balance }],
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else if (key === "batstore") {
      const { apiToken, enabled } = await getBatStoreCredentials();
      if (!apiToken || !enabled) return { ok: false, errorKind: "missing_key" };

      // Read, not a purchase — abandoning it costs nothing.
      const account = await withDeadline("batstore", BALANCE_DEADLINE_MS, () =>
        new BatStoreClient(apiToken).getMe(),
      );
      card = {
        key,
        provider: "batstore",
        label: account.username,
        logo: null,
        balances: [{ currency: "USD", amount: account.balance }],
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else if (key.startsWith("sam:")) {
      const [, methodRaw, identifier] = key.split(":");
      const method = methodRaw === "syriatel" ? "syriatel" : "shamcash";
      const { apiKey, enabled } = await getSamCredentials();
      if (!apiKey || !enabled || !identifier) return { ok: false, errorKind: "missing_key" };

      // Read, not a purchase; the retry budget belongs to the checkout path.
      const balances = await withDeadline("sam", BALANCE_DEADLINE_MS, () =>
        new SamClient(apiKey).getWalletBalance(method as SamMethod, identifier),
      );
      card = {
        key,
        provider: "sam",
        label: method === "syriatel" ? "SyriatelCash" : "ShamCash",
        logo: method === "shamcash" ? "shamcash" : null,
        balances,
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else {
      return { ok: false, errorKind: "unknown_wallet" };
    }

    await supabase.from(WALLET_TABLE).upsert(
      {
        wallet_key: card.key,
        provider: card.provider,
        label: card.label,
        balances: card.balances,
        status: card.status,
        error_kind: card.errorKind,
        synced_at: card.syncedAt ?? undefined,
      },
      { onConflict: "wallet_key" },
    );

    return { ok: true, card };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";

    // Remember the failure too, so a dead supplier reads as one instead of as
    // a stale number wearing a green badge.
    await supabase
      .from(WALLET_TABLE)
      .upsert(
        {
          wallet_key: key,
          provider: key.split(":")[0] ?? key,
          status: "error",
          error_kind: message.slice(0, 120),
          synced_at: new Date().toISOString(),
        },
        { onConflict: "wallet_key" },
      )
      .then(() => undefined, () => undefined);

    return { ok: false, errorKind: "unreachable" };
  }
}

type WalletRow = {
  wallet_key: string;
  provider: string;
  label: string | null;
  balances: unknown;
  status: string;
  error_kind: string | null;
  synced_at: string | null;
};

/**
 * Card skeletons from configuration alone — no supplier traffic.
 *
 * Sam's cards come from the stored wallet identifiers, so even a never-synced
 * ShamCash shows up with its name rather than vanishing until first press.
 */
async function buildWalletSkeletons(): Promise<WalletCard[]> {
  const [g2bulk, maxstore, batstore, sam] = await Promise.all([
    getG2BulkCredentials(),
    getMaxStoreCredentials(),
    getBatStoreCredentials(),
    getSamCredentials(),
  ]);

  const cards: WalletCard[] = [];

  if (g2bulk.apiKey && g2bulk.enabled) {
    cards.push({
      key: "g2bulk",
      provider: "g2bulk",
      label: "G2Bulk",
      logo: null,
      balances: [],
      status: "never",
      errorKind: null,
      syncedAt: null,
    });
  }

  if (maxstore.apiToken && maxstore.enabled) {
    cards.push({
      key: "maxstore",
      provider: "maxstore",
      label: "MaxStore",
      logo: null,
      balances: [],
      status: "never",
      errorKind: null,
      syncedAt: null,
    });
  }

  if (batstore.apiToken && batstore.enabled) {
    cards.push({
      key: "batstore",
      provider: "batstore",
      label: "BatStore",
      logo: null,
      balances: [],
      status: "never",
      errorKind: null,
      syncedAt: null,
    });
  }

  if (sam.apiKey && sam.enabled) {
    if (sam.shamcashIdentifier) {
      cards.push({
        key: `sam:shamcash:${sam.shamcashIdentifier}`,
        provider: "sam",
        label: "ShamCash",
        logo: "shamcash",
        balances: [],
        status: "never",
        errorKind: null,
        syncedAt: null,
      });
    }

    if (sam.syriatelIdentifier) {
      cards.push({
        key: `sam:syriatel:${sam.syriatelIdentifier}`,
        provider: "sam",
        label: "SyriatelCash",
        logo: null,
        balances: [],
        status: "never",
        errorKind: null,
        syncedAt: null,
      });
    }
  }

  return cards;
}

