import { ForbiddenError, requireAdmin, UnauthorizedError } from "@server/lib/auth/guards";
import { syncWalletCard } from "@server/lib/services/admin-overview.service";

/** A resource endpoint: each supplier refresh returns JSON without rerendering the dashboard. */
export async function action({ request }: { request: Request }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return Response.json({ ok: false, errorKind: "unauthorized" }, {
        status: error instanceof UnauthorizedError ? 401 : 403,
      });
    }
    throw error;
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const key = String(form.get("key") ?? "").trim();
  if (form.get("intent") !== "syncWallet" || !key || key.length > 160) {
    return Response.json({ ok: false, errorKind: "unknown_wallet" }, { status: 400 });
  }
  const result = await syncWalletCard(key);
  return Response.json(result.ok
    ? { ok: true, balances: result.card.balances, syncedAt: result.card.syncedAt ?? new Date().toISOString() }
    : result, { headers: { "Cache-Control": "no-store" } });
}

export function loader() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
