import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { G2BulkError } from "@/providers/g2bulk/errors";
import {
  G2BULK_PROVIDER_NAME,
  mapInputFields,
  toGameSlug,
  toOfferSlug,
  toRetailPrice,
  resolveProviderImageUrl,
} from "@/providers/g2bulk/mapping";
import type {
  ImportGameOutcome,
  ImportOptions,
  ImportSummary,
} from "@/providers/g2bulk/import-types";
import type { Database } from "@/types/database";

/**
 * G2Bulk catalogue import.
 *
 * Idempotent by design: a game is identified by its provider code through
 * `provider_game_mappings`, and an offer by its `external_catalogue_name` within
 * that game. Re-importing therefore updates instead of duplicating.
 *
 * Re-import deliberately preserves the admin's work. Names, descriptions,
 * artwork, activation, and ordering are only written when a row is first
 * created; afterwards the provider is treated as the authority on supplier cost
 * and availability, not on presentation. A price is only recomputed while the
 * offer is still on default pricing — a custom or fixed price is a decision, and
 * a sync must not silently undo it.
 */

type Client = SupabaseClient<Database>;

function nowIso(): string {
  return new Date().toISOString();
}

/** Whether a sync parked this offer, as recorded in the mapping metadata. */
function readParkedBySync(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as { parked_by_sync?: unknown }).parked_by_sync === true;
}

function describeError(error: unknown): string {
  if (error instanceof G2BulkError) {
    return `${error.kind}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

/** Make a slug unique against a set of slugs already in use. */
function uniqueSlug(base: string, taken: Set<string>, fallbackSuffix: string): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }

  const candidate = `${base}-${fallbackSuffix}`;

  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }

  let counter = 2;
  while (taken.has(`${candidate}-${counter}`)) {
    counter += 1;
  }

  const unique = `${candidate}-${counter}`;
  taken.add(unique);

  return unique;
}

async function findMappedGameId(supabase: Client, code: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("provider_game_mappings")
    .select("game_id")
    .eq("provider_name", G2BULK_PROVIDER_NAME)
    .eq("external_game_code", code)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading the provider mapping failed: ${error.message}`);
  }

  return data?.game_id ?? null;
}

async function takenGameSlugs(supabase: Client): Promise<Set<string>> {
  const { data, error } = await supabase.from("games").select("slug");

  if (error) {
    throw new Error(`Reading existing game slugs failed: ${error.message}`);
  }

  return new Set(data.map((row) => row.slug));
}

async function importOneGame(
  supabase: Client,
  provider: G2BulkClient,
  code: string,
  options: ImportOptions,
  gameSlugs: Set<string>,
): Promise<ImportGameOutcome> {
  // The catalogue call carries the provider's own name and artwork for the game,
  // so it doubles as the source for the game row.
  const catalogue = await provider.getGameCatalogue(code);
  const fields = await provider.getGameFields(code).catch(() => null);
  const servers = fields ? await provider.getGameServers(code).catch(() => null) : null;

  const providerName = catalogue.game.name;
  const imageUrl = resolveProviderImageUrl(catalogue.game.image_url);
  let gameId = await findMappedGameId(supabase, code);
  const status: ImportGameOutcome["status"] = gameId ? "updated" : "created";

  if (!gameId) {
    const slug = uniqueSlug(toGameSlug({ code, name: providerName }), gameSlugs, code);
    const { data, error } = await supabase
      .from("games")
      .insert({
        slug,
        name_ar: providerName,
        name_en: providerName,
        image_url: imageUrl,
        is_active: options.publish,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Creating the game failed: ${error.message}`);
    }

    gameId = data.id;
  }

  const { error: mappingError } = await supabase.from("provider_game_mappings").upsert(
    {
      game_id: gameId,
      provider_name: G2BULK_PROVIDER_NAME,
      external_game_code: code,
      metadata: {
        provider_name: providerName,
        provider_image_url: catalogue.game.image_url ?? null,
        fields: fields?.info.fields ?? [],
        // `notes` explains what an ambiguous field means for this game, so it is
        // kept for the checkout form to surface later.
        notes: fields?.info.notes ?? null,
        servers: servers?.servers ?? null,
        catalogue_count: catalogue.catalogues.length,
        synced_at: nowIso(),
      },
    },
    { onConflict: "game_id,provider_name" },
  );

  if (mappingError) {
    throw new Error(`Saving the provider mapping failed: ${mappingError.message}`);
  }

  if (fields) {
    const mapped = mapInputFields(fields, servers);

    if (mapped.length > 0) {
      const { error: fieldsError } = await supabase.from("game_input_fields").upsert(
        mapped.map((field) => ({
          game_id: gameId,
          field_key: field.fieldKey,
          field_type: field.fieldType,
          label_ar: field.labelAr,
          label_en: field.labelEn,
          is_required: field.isRequired,
          sort_order: field.sortOrder,
          options: field.options,
        })),
        { onConflict: "game_id,field_key" },
      );

      if (fieldsError) {
        throw new Error(`Saving the account fields failed: ${fieldsError.message}`);
      }
    }
  }

  const { offersCreated, offersUpdated, offersDeactivated } = await importOffers(
    supabase,
    gameId,
    catalogue.catalogues,
    options,
  );

  // A game the provider has emptied cannot be sold, so it leaves the storefront
  // even if an admin had published it.
  if (catalogue.catalogues.length === 0) {
    const { error } = await supabase.from("games").update({ is_active: false }).eq("id", gameId);

    if (error) {
      throw new Error(`Deactivating the empty game failed: ${error.message}`);
    }
  }

  return { code, name: providerName, status, offersCreated, offersUpdated, offersDeactivated };
}

async function importOffers(
  supabase: Client,
  gameId: string,
  catalogues: { id: number; name: string; amount: number }[],
  options: ImportOptions,
): Promise<{ offersCreated: number; offersUpdated: number; offersDeactivated: number }> {
  const { data: existingOffers, error: offersError } = await supabase
    .from("offers")
    .select("id, slug, is_sale, is_active")
    .eq("game_id", gameId);

  if (offersError) {
    throw new Error(`Reading existing offers failed: ${offersError.message}`);
  }

  const offersById = new Map(existingOffers.map((offer) => [offer.id, offer]));

  const offerIds = existingOffers.map((offer) => offer.id);
  const mappingsByName = new Map<
    string,
    { offerId: string; pricingMode: string; parkedBySync: boolean }
  >();

  if (offerIds.length > 0) {
    const { data: mappings, error: mappingsError } = await supabase
      .from("provider_offer_mappings")
      .select("offer_id, external_catalogue_name, pricing_mode, metadata")
      .eq("provider_name", G2BULK_PROVIDER_NAME)
      .in("offer_id", offerIds);

    if (mappingsError) {
      throw new Error(`Reading offer mappings failed: ${mappingsError.message}`);
    }

    for (const mapping of mappings) {
      if (mapping.external_catalogue_name) {
        mappingsByName.set(mapping.external_catalogue_name, {
          offerId: mapping.offer_id,
          pricingMode: mapping.pricing_mode,
          parkedBySync: readParkedBySync(mapping.metadata),
        });
      }
    }
  }

  const offerSlugs = new Set(existingOffers.map((offer) => offer.slug));
  let offersCreated = 0;
  let offersUpdated = 0;

  for (const [index, item] of catalogues.entries()) {
    const price = toRetailPrice({
      supplierCostUsd: item.amount,
      markupPercent: options.markupPercent,
    });
    const existing = mappingsByName.get(item.name);

    if (existing) {
      const offerRow = offersById.get(existing.offerId);
      // Refresh the retail price only while the offer is still on default
      // pricing and not on sale. A custom price, a fixed price, or a live sale
      // price is an explicit decision, and a catalogue sync must not undo it.
      const mayRepriceOffer = existing.pricingMode === "default" && offerRow?.is_sale !== true;
      const offerUpdate: { price?: number; is_active?: boolean } = {};

      if (mayRepriceOffer) {
        offerUpdate.price = price;
      }

      /*
       * Reactivate only what a sync parked. An offer is inactive for one of two
       * very different reasons: reconciliation withdrew it, or an admin hid it
       * (including importing with "publish immediately" off). Republishing the
       * second kind would override a decision, so the mapping records which one
       * it was.
       */
      if (offerRow?.is_active === false && existing.parkedBySync) {
        offerUpdate.is_active = true;
      }

      if (Object.keys(offerUpdate).length > 0) {
        const { error } = await supabase
          .from("offers")
          .update(offerUpdate)
          .eq("id", existing.offerId);

        if (error) {
          throw new Error(`Updating the offer failed: ${error.message}`);
        }
      }

      const { error: mapError } = await supabase.from("provider_offer_mappings").upsert(
        {
          offer_id: existing.offerId,
          provider_name: G2BULK_PROVIDER_NAME,
          external_catalogue_name: item.name,
          supplier_cost_usd: item.amount,
          markup_percent: options.markupPercent,
          metadata: { catalogue_id: item.id, synced_at: nowIso(), parked_by_sync: false },
        },
        { onConflict: "offer_id,provider_name" },
      );

      if (mapError) {
        throw new Error(`Updating the offer mapping failed: ${mapError.message}`);
      }

      offersUpdated += 1;
      continue;
    }

    const slug = uniqueSlug(toOfferSlug(item), offerSlugs, String(item.id));
    const { data: created, error: createError } = await supabase
      .from("offers")
      .insert({
        game_id: gameId,
        slug,
        offer_type: "topup",
        name_ar: item.name,
        name_en: item.name,
        price,
        currency: "USD",
        is_active: options.publish,
        sort_order: index,
      })
      .select("id")
      .single();

    if (createError) {
      throw new Error(`Creating the offer failed: ${createError.message}`);
    }

    const { error: mapError } = await supabase.from("provider_offer_mappings").insert({
      offer_id: created.id,
      provider_name: G2BULK_PROVIDER_NAME,
      external_catalogue_name: item.name,
      supplier_cost_usd: item.amount,
      pricing_mode: "default",
      markup_percent: options.markupPercent,
      metadata: { catalogue_id: item.id, synced_at: nowIso(), parked_by_sync: false },
    });

    if (mapError) {
      throw new Error(`Creating the offer mapping failed: ${mapError.message}`);
    }

    offersCreated += 1;
  }

  const deactivated = await deactivateWithdrawnOffers(
    supabase,
    mappingsByName,
    new Set(catalogues.map((item) => item.name)),
    new Map(catalogues.map((item) => [item.name, item.id])),
  );

  return { offersCreated, offersUpdated, offersDeactivated: deactivated };
}

/**
 * Park offers the provider no longer lists.
 *
 * Deactivated rather than deleted: order history and invoices reference these
 * rows, and a denomination that disappears for a week often comes back. What
 * matters is that a customer can no longer buy something the supplier cannot
 * fulfil.
 */
async function deactivateWithdrawnOffers(
  supabase: Client,
  mappingsByName: Map<string, { offerId: string; pricingMode: string; parkedBySync: boolean }>,
  liveNames: Set<string>,
  catalogueIdByName: Map<string, number>,
): Promise<number> {
  const withdrawn = [...mappingsByName.entries()].filter(([name]) => !liveNames.has(name));

  if (withdrawn.length === 0) {
    return 0;
  }

  const offerIds = withdrawn.map(([, mapping]) => mapping.offerId);
  const { error } = await supabase.from("offers").update({ is_active: false }).in("id", offerIds);

  if (error) {
    throw new Error(`Deactivating withdrawn offers failed: ${error.message}`);
  }

  // Record that the sync did this, so a later run may put it back but will leave
  // an admin's own decision alone.
  for (const [name, mapping] of withdrawn) {
    await supabase.from("provider_offer_mappings").upsert(
      {
        offer_id: mapping.offerId,
        provider_name: G2BULK_PROVIDER_NAME,
        external_catalogue_name: name,
        metadata: {
          catalogue_id: catalogueIdByName.get(name) ?? null,
          synced_at: nowIso(),
          parked_by_sync: true,
        },
      },
      { onConflict: "offer_id,provider_name" },
    );
  }

  return withdrawn.length;
}

/**
 * Import the selected provider games.
 *
 * One failing game does not abort the run: its error is recorded against that
 * game and the rest continue, because a single unavailable catalogue should not
 * cost the admin the whole import.
 */
export async function importG2BulkGames(
  supabase: Client,
  apiKey: string,
  codes: string[],
  options: ImportOptions,
  startedBy: string,
): Promise<ImportSummary> {
  const provider = new G2BulkClient({ apiKey });
  const gameSlugs = await takenGameSlugs(supabase);

  const { data: log } = await supabase
    .from("provider_sync_logs")
    .insert({
      provider_name: G2BULK_PROVIDER_NAME,
      kind: "catalog_import",
      status: "running",
      requested_count: codes.length,
      details: { codes, publish: options.publish, markup_percent: options.markupPercent },
      started_by: startedBy,
    })
    .select("id")
    .maybeSingle();

  const outcomes: ImportGameOutcome[] = [];

  for (const code of codes) {
    try {
      outcomes.push(await importOneGame(supabase, provider, code, options, gameSlugs));
    } catch (error) {
      outcomes.push({
        code,
        name: code,
        status: "failed",
        offersCreated: 0,
        offersUpdated: 0,
        offersDeactivated: 0,
        error: describeError(error),
      });
    }
  }

  const created = outcomes.filter((outcome) => outcome.status === "created").length;
  const updated = outcomes.filter((outcome) => outcome.status === "updated").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  const offersCreated = outcomes.reduce((total, outcome) => total + outcome.offersCreated, 0);
  const offersUpdated = outcomes.reduce((total, outcome) => total + outcome.offersUpdated, 0);
  const offersDeactivated = outcomes.reduce(
    (total, outcome) => total + outcome.offersDeactivated,
    0,
  );

  if (log?.id) {
    await supabase
      .from("provider_sync_logs")
      .update({
        status: failed === 0 ? "succeeded" : failed === codes.length ? "failed" : "partial",
        created_count: created,
        updated_count: updated,
        failed_count: failed,
        finished_at: nowIso(),
        details: {
          codes,
          publish: options.publish,
          markup_percent: options.markupPercent,
          offers_created: offersCreated,
          offers_updated: offersUpdated,
          offers_deactivated: offersDeactivated,
          outcomes,
        },
        error_message: outcomes.find((outcome) => outcome.error)?.error ?? null,
      })
      .eq("id", log.id);
  }

  return {
    logId: log?.id ?? null,
    requested: codes.length,
    created,
    updated,
    failed,
    offersCreated,
    offersUpdated,
    offersDeactivated,
    outcomes,
  };
}
