import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dashboard counters.
 *
 * Each count is a `head: true` query, so the database returns a total without
 * shipping any rows. A counter that fails to read comes back as null and renders
 * as a dash — a misleading zero would read as "no games" when the truth is "we
 * could not check".
 */
export type AdminOverviewStats = {
  games: number | null;
  activeGames: number | null;
  offers: number | null;
  activeOffers: number | null;
  orders: number | null;
  customers: number | null;
};

type CountResult = { count: number | null; error: unknown };

function toCount({ count, error }: CountResult): number | null {
  return error ? null : (count ?? 0);
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact", head: true } as const;

  const [games, activeGames, offers, activeOffers, orders, customers] = await Promise.all([
    supabase.from("games").select("id", head),
    supabase.from("games").select("id", head).eq("is_active", true),
    supabase.from("offers").select("id", head),
    supabase.from("offers").select("id", head).eq("is_active", true),
    supabase.from("orders").select("id", head),
    supabase.from("profiles").select("id", head).eq("role", "customer"),
  ]);

  return {
    games: toCount(games),
    activeGames: toCount(activeGames),
    offers: toCount(offers),
    activeOffers: toCount(activeOffers),
    orders: toCount(orders),
    customers: toCount(customers),
  };
}
