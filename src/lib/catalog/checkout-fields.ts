/**
 * What a buyer must type, decided from data rather than habit.
 *
 * Whether an offer needs anything from the customer used to be an accident of
 * its container: every offer under a game inherited the game's field rows, and
 * nothing anywhere declared "this one needs nothing — pay and receive". The
 * providers declare exactly that (MaxStore ships `params_meta` per product,
 * BatStore tags products `stock` / `supplier_api` / `activation`), so the
 * declaration now lives on the offer itself.
 */

/** A buyer-input definition as stored in `offers.input_fields` jsonb. */
export type OfferInputFieldDef = {
  field_key: string;
  field_type:
    | "text"
    | "number"
    | "email"
    | "uid"
    | "server"
    | "charname"
    | "select";
  label_ar?: string | null;
  label_en?: string | null;
  placeholder_ar?: string | null;
  placeholder_en?: string | null;
  is_required?: boolean | null;
  options?: unknown;
};

const KNOWN_FIELD_TYPES = new Set([
  "text",
  "number",
  "email",
  "uid",
  "server",
  "charname",
  "select",
]);

/**
 * Read the stored jsonb as field definitions.
 *
 * Anything that does not shape up as a usable field is dropped rather than
 * coerced: a half-read definition would render as a mystery input or, worse,
 * silently stop validating what the supplier will insist on.
 */
export function normalizeOfferInputFields(value: unknown): OfferInputFieldDef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const defs: OfferInputFieldDef[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const raw = entry as Record<string, unknown>;
    const fieldKey = typeof raw.field_key === "string" ? raw.field_key.trim() : "";

    if (!fieldKey) {
      continue;
    }

    const fieldType =
      typeof raw.field_type === "string" && KNOWN_FIELD_TYPES.has(raw.field_type)
        ? (raw.field_type as OfferInputFieldDef["field_type"])
        : "text";

    defs.push({
      field_key: fieldKey,
      field_type: fieldType,
      label_ar: typeof raw.label_ar === "string" ? raw.label_ar : null,
      label_en: typeof raw.label_en === "string" ? raw.label_en : null,
      placeholder_ar: typeof raw.placeholder_ar === "string" ? raw.placeholder_ar : null,
      placeholder_en: typeof raw.placeholder_en === "string" ? raw.placeholder_en : null,
      is_required: raw.is_required !== false,
      options: Array.isArray(raw.options) ? raw.options : [],
    });
  }

  return defs;
}

export type CheckoutFieldSource = {
  /** `offers.delivery_kind`. */
  deliveryKind: string | null;
  /** `offers.input_fields`, already through {@link normalizeOfferInputFields}. */
  offerFields: OfferInputFieldDef[];
};

export type ContainerFieldSource = {
  /** `field_key`s of the parent game's `game_input_fields` rows. */
  gameFieldKeys: string[];
};

/**
 * Which fields this checkout shows, and where they came from.
 *
 * - `direct`: nothing. The goods arrive after payment; asking for a player id
 *   a product will never use is a wall between the customer and the buy.
 * - otherwise the offer's own definitions when it has any, else the game's
 *   container rows — the pre-existing behaviour for imports that never wrote
 *   per-offer fields.
 */
export function resolveCheckoutFieldKeys(
  offer: CheckoutFieldSource,
  container: ContainerFieldSource,
): { kind: "none" | "offer" | "game"; keys: Set<string> } {
  if (offer.deliveryKind === "direct") {
    return { kind: "none", keys: new Set() };
  }

  if (offer.offerFields.length > 0) {
    return { kind: "offer", keys: new Set(offer.offerFields.map((field) => field.field_key)) };
  }

  return { kind: "game", keys: new Set(container.gameFieldKeys) };
}

/**
 * How many units one purchase may carry.
 *
 * Direct goods are stock: buying three of them buys three codes, and the
 * providers' own bounds (`qty_values.max`) say how high that goes, capped at
 * ten like every multi-unit purchase here. An `account` top-up stays
 * single-unit — the supplier's order takes no quantity, so two units would be
 * two deliveries wearing one charge.
 */
export function resolveQuantityMax(input: {
  deliveryKind: string | null;
  providerMax: number | null;
}): number {
  if (input.deliveryKind !== "direct") {
    return 1;
  }

  const providerMax = input.providerMax !== null && Number.isFinite(input.providerMax)
    ? Math.floor(input.providerMax)
    : null;

  return Math.min(Math.max(providerMax ?? 10, 1), 10);
}
