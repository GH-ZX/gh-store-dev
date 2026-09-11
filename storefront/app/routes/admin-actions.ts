import * as liveActions from "@server/legacy/lib/live-edit/actions";
import * as actions0 from "@server/legacy/app/[locale]/dashboard/catalog/actions";
import * as actions1 from "@server/legacy/app/[locale]/dashboard/providers/actions";
import * as actions2 from "@server/legacy/app/[locale]/dashboard/providers/axiom-actions";
import * as actions3 from "@server/legacy/app/[locale]/dashboard/providers/batstore/import/actions";
import * as actions4 from "@server/legacy/app/[locale]/dashboard/providers/g2bulk/vouchers/actions";
import * as actions5 from "@server/legacy/app/[locale]/dashboard/providers/maxstore/import/actions";
import * as actions6 from "@server/legacy/app/[locale]/dashboard/providers/sam-actions";
import * as actions7 from "@server/legacy/app/[locale]/dashboard/providers/telegram-actions";
import type { ActionFunctionArgs } from "react-router";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@server/lib/auth/guards";
const actions = {
  saveRechargeMethodsAction: liveActions.saveRechargeMethodsAction,
  loadProductPresentationAction: liveActions.loadProductPresentationAction,
  saveProductPresentationAction: liveActions.saveProductPresentationAction,
  saveHomeSectionCopyAction: liveActions.saveHomeSectionCopyAction,
  updateProductAction: actions0.updateProductAction,
  deleteProductAction: actions0.deleteProductAction,
  deleteProductDirectAction: actions0.deleteProductDirectAction,
  saveProviderLinkAction: actions0.saveProviderLinkAction,
  updateOffersAction: actions0.updateOffersAction,
  createProductAction: actions0.createProductAction,
  createOfferAction: actions0.createOfferAction,
  deleteOfferAction: actions0.deleteOfferAction,
  searchIgdbArtworkAction: actions0.searchIgdbArtworkAction,
  addStockItemAction: actions0.addStockItemAction,
  bulkAddStockItemsAction: actions0.bulkAddStockItemsAction,
  deleteStockItemAction: actions0.deleteStockItemAction,
  reorderCarouselProducts: actions0.reorderCarouselProducts,
  saveG2BulkSettingsAction: actions1.saveG2BulkSettingsAction,
  verifyG2BulkKeyAction: actions1.verifyG2BulkKeyAction,
  regenerateG2BulkCallbackAction: actions1.regenerateG2BulkCallbackAction,
  importG2BulkGamesAction: actions1.importG2BulkGamesAction,
  removeImportedProductAction: actions1.removeImportedProductAction,
  saveMaxStoreSettingsAction: actions1.saveMaxStoreSettingsAction,
  verifyMaxStoreTokenAction: actions1.verifyMaxStoreTokenAction,
  saveBatStoreSettingsAction: actions1.saveBatStoreSettingsAction,
  verifyBatStoreTokenAction: actions1.verifyBatStoreTokenAction,
  saveIgdbSettingsAction: actions1.saveIgdbSettingsAction,
  verifyIgdbAction: actions1.verifyIgdbAction,
  saveFulfillmentSettingsAction: actions1.saveFulfillmentSettingsAction,
  saveBinanceSettingsAction: actions1.saveBinanceSettingsAction,
  saveAxiomSettingsAction: actions2.saveAxiomSettingsAction,
  testAxiomAction: actions2.testAxiomAction,
  importBatStoreAction: actions3.importBatStoreAction,
  importG2BulkVouchersAction: actions4.importG2BulkVouchersAction,
  importMaxStoreAction: actions5.importMaxStoreAction,
  saveSamSettingsAction: actions6.saveSamSettingsAction,
  regenerateSamSecretAction: actions6.regenerateSamSecretAction,
  refreshSamWalletsAction: actions6.refreshSamWalletsAction,
  saveTelegramSettingsAction: actions7.saveTelegramSettingsAction,
  verifyTelegramBotAction: actions7.verifyTelegramBotAction,
  registerTelegramWebhookAction: actions7.registerTelegramWebhookAction,
  setTelegramCommandsAction: actions7.setTelegramCommandsAction,
};
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  try { await requireAdmin(); }
  catch (error) {
    if (error instanceof UnauthorizedError) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: 403 });
    throw error;
  }
  const form = await request.formData();
  const name = form.get("action");
  if (typeof name !== "string" || !Object.hasOwn(actions, name)) return new Response("Unknown action", { status: 400 });
  let args: unknown[];
  try {
    const encoded: unknown = JSON.parse(String(form.get("args")));
    if (!Array.isArray(encoded) || encoded.length > 10) throw new Error("Invalid arguments");
    args = encoded.map((value) => {
      if (value && typeof value === "object" && "$form" in value) {
        const payload = new FormData();
        for (const [key, entry] of form.entries()) {
          const prefix = `form${value.$form}:`;
          if (key.startsWith(prefix)) payload.append(key.slice(prefix.length), entry);
        }
        return payload;
      }
      return value;
    });
  } catch { return new Response("Invalid arguments", { status: 400 }); }
  try {
    const fn = actions[name as keyof typeof actions] as (...args: unknown[]) => Promise<unknown>;
    const result = await fn(...args);
    if (typeof caches !== "undefined") {
      try {
        const cacheStore = caches as unknown as { default: Cache };
        const cache = cacheStore.default;
        const origin = new URL(request.url).origin;
        for (const p of ["/ar", "/en", "/ar/products", "/en/products", "/ar/games", "/en/games"]) {
          cache.delete(new Request(`${origin}${p}`)).catch(() => false);
        }
      } catch {}
    }
    return Response.json({ result });
  } catch (error) {
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      return Response.json({ redirect: error.headers.get("Location") });
    }
    if (error instanceof Response) throw error;
    console.error("Admin action failed", name, error);
    return Response.json({ error: "unknown" }, { status: 500 });
  }
}
