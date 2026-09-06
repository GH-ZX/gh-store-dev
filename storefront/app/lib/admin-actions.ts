/** Finite, typed bridge for the restored admin forms. Authority stays on the server. */
function remote<T extends (...args: never[]) => Promise<unknown>>(name: string): T {
  return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const body = new FormData();
    body.set("action", name);
    body.set("args", JSON.stringify((args as unknown[]).map((arg, index) => {
      if (!(arg instanceof FormData)) return arg;
      for (const [key, value] of arg.entries()) body.append(`form${index}:${key}`, value);
      return { $form: index };
    })));
    const response = await fetch("/api/admin-actions", { method: "POST", body, headers: { Accept: "application/json" } });
    if (response.redirected) { window.location.assign(response.url); return await new Promise(() => {}); }
    if (!response.ok) throw new Error("Unable to complete the admin action. Please retry.");
    const envelope = await response.json() as { result: Awaited<ReturnType<T>>; redirect?: string };
    if (envelope.redirect) { window.location.assign(envelope.redirect); return await new Promise(() => {}); }
    window.dispatchEvent(new Event("admin-action-complete"));
    return envelope.result;
  }) as T;
}
import type * as actions0 from "@server/legacy/app/[locale]/dashboard/catalog/actions";
export const updateProductAction = remote<typeof actions0.updateProductAction>("updateProductAction");
export const deleteProductAction = remote<typeof actions0.deleteProductAction>("deleteProductAction");
export const saveProviderLinkAction = remote<typeof actions0.saveProviderLinkAction>("saveProviderLinkAction");
export const updateOffersAction = remote<typeof actions0.updateOffersAction>("updateOffersAction");
export const createProductAction = remote<typeof actions0.createProductAction>("createProductAction");
export const createOfferAction = remote<typeof actions0.createOfferAction>("createOfferAction");
export const deleteOfferAction = remote<typeof actions0.deleteOfferAction>("deleteOfferAction");
export const searchIgdbArtworkAction = remote<typeof actions0.searchIgdbArtworkAction>("searchIgdbArtworkAction");
export const addStockItemAction = remote<typeof actions0.addStockItemAction>("addStockItemAction");
export const bulkAddStockItemsAction = remote<typeof actions0.bulkAddStockItemsAction>("bulkAddStockItemsAction");
export const deleteStockItemAction = remote<typeof actions0.deleteStockItemAction>("deleteStockItemAction");
export const reorderCarouselProducts = remote<typeof actions0.reorderCarouselProducts>("reorderCarouselProducts");
import type * as actions1 from "@server/legacy/app/[locale]/dashboard/providers/actions";
export const saveG2BulkSettingsAction = remote<typeof actions1.saveG2BulkSettingsAction>("saveG2BulkSettingsAction");
export const verifyG2BulkKeyAction = remote<typeof actions1.verifyG2BulkKeyAction>("verifyG2BulkKeyAction");
export const regenerateG2BulkCallbackAction = remote<typeof actions1.regenerateG2BulkCallbackAction>("regenerateG2BulkCallbackAction");
export const importG2BulkGamesAction = remote<typeof actions1.importG2BulkGamesAction>("importG2BulkGamesAction");
export const removeImportedProductAction = remote<typeof actions1.removeImportedProductAction>("removeImportedProductAction");
export const saveMaxStoreSettingsAction = remote<typeof actions1.saveMaxStoreSettingsAction>("saveMaxStoreSettingsAction");
export const verifyMaxStoreTokenAction = remote<typeof actions1.verifyMaxStoreTokenAction>("verifyMaxStoreTokenAction");
export const saveBatStoreSettingsAction = remote<typeof actions1.saveBatStoreSettingsAction>("saveBatStoreSettingsAction");
export const verifyBatStoreTokenAction = remote<typeof actions1.verifyBatStoreTokenAction>("verifyBatStoreTokenAction");
export const saveIgdbSettingsAction = remote<typeof actions1.saveIgdbSettingsAction>("saveIgdbSettingsAction");
export const verifyIgdbAction = remote<typeof actions1.verifyIgdbAction>("verifyIgdbAction");
export const saveFulfillmentSettingsAction = remote<typeof actions1.saveFulfillmentSettingsAction>("saveFulfillmentSettingsAction");
export const saveBinanceSettingsAction = remote<typeof actions1.saveBinanceSettingsAction>("saveBinanceSettingsAction");
import type * as actions2 from "@server/legacy/app/[locale]/dashboard/providers/axiom-actions";
export const saveAxiomSettingsAction = remote<typeof actions2.saveAxiomSettingsAction>("saveAxiomSettingsAction");
export const testAxiomAction = remote<typeof actions2.testAxiomAction>("testAxiomAction");
import type * as actions3 from "@server/legacy/app/[locale]/dashboard/providers/batstore/import/actions";
export const importBatStoreAction = remote<typeof actions3.importBatStoreAction>("importBatStoreAction");
import type * as actions4 from "@server/legacy/app/[locale]/dashboard/providers/g2bulk/vouchers/actions";
export const importG2BulkVouchersAction = remote<typeof actions4.importG2BulkVouchersAction>("importG2BulkVouchersAction");
import type * as actions5 from "@server/legacy/app/[locale]/dashboard/providers/maxstore/import/actions";
export const importMaxStoreAction = remote<typeof actions5.importMaxStoreAction>("importMaxStoreAction");
import type * as actions6 from "@server/legacy/app/[locale]/dashboard/providers/sam-actions";
export const saveSamSettingsAction = remote<typeof actions6.saveSamSettingsAction>("saveSamSettingsAction");
export const regenerateSamSecretAction = remote<typeof actions6.regenerateSamSecretAction>("regenerateSamSecretAction");
export const refreshSamWalletsAction = remote<typeof actions6.refreshSamWalletsAction>("refreshSamWalletsAction");
import type * as actions7 from "@server/legacy/app/[locale]/dashboard/providers/telegram-actions";
export const saveTelegramSettingsAction = remote<typeof actions7.saveTelegramSettingsAction>("saveTelegramSettingsAction");
export const verifyTelegramBotAction = remote<typeof actions7.verifyTelegramBotAction>("verifyTelegramBotAction");
export const registerTelegramWebhookAction = remote<typeof actions7.registerTelegramWebhookAction>("registerTelegramWebhookAction");
export const setTelegramCommandsAction = remote<typeof actions7.setTelegramCommandsAction>("setTelegramCommandsAction");

import type * as liveActions from "@server/legacy/lib/live-edit/actions";
export const saveRechargeMethodsAction = remote<typeof liveActions.saveRechargeMethodsAction>("saveRechargeMethodsAction");
export const loadProductPresentationAction = remote<typeof liveActions.loadProductPresentationAction>("loadProductPresentationAction");
export const saveProductPresentationAction = remote<typeof liveActions.saveProductPresentationAction>("saveProductPresentationAction");
export const saveHomeSectionCopyAction = remote<typeof liveActions.saveHomeSectionCopyAction>("saveHomeSectionCopyAction");
