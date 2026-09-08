import type {
  G2BulkCatalogueItem,
  G2BulkGame,
  G2BulkGameFields,
  G2BulkGameServers,
} from "@/providers/g2bulk/schemas";

/**
 * Pure translation between the G2Bulk catalogue and the GH Store schema.
 *
 * Deliberately free of I/O so every rule here is unit-testable: the retail price
 * a customer sees, the slug a URL uses, and which account fields a game asks for
 * are all decisions worth pinning down in tests.
 */

// The price rule is the store's, not this supplier's: it lives in
// `@/lib/catalog/pricing` so a second supplier cannot grow a second answer.
export { toRetailPrice, type RetailPriceInput } from "@/lib/catalog/pricing";

export const G2BULK_PROVIDER_NAME = "g2bulk";
const G2BULK_ORIGIN = "https://api.g2bulk.com";

export const PRICING_DEFAULTS = {
  markupPercent: 15,
  minMarkupPercent: 0,
  maxMarkupPercent: 500,
} as const;

/**
 * Resolve provider artwork to an absolute URL.
 *
 * `GET /v1/games` documents `image_url` as a host-relative path such as
 * `/images/pubg_mobile.png`, so a relative value is resolved against the API
 * origin. Anything already absolute is passed through untouched.
 */
export function resolveProviderImageUrl(imageUrl: string | null | undefined): string | null {
  const value = imageUrl?.trim();

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${G2BULK_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

/**
 * URL-safe slug.
 *
 * Latin text is lowercased and hyphenated. Arabic and other non-Latin letters
 * are kept as-is rather than stripped, because dropping them would collapse
 * different product names to the same slug.
 */
export function toSlug(value: string): string {
  const normalized = value
    .normalize("NFKD")
    // Drop combining marks left behind by NFKD so "Pokémon" slugs as "pokemon".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 80);
}

/** Slug for an offer, kept unique within its game by falling back to the id. */
export function toOfferSlug(catalogue: G2BulkCatalogueItem): string {
  const slug = toSlug(catalogue.name);

  return slug || `item-${catalogue.id}`;
}

export function toGameSlug(game: Pick<G2BulkGame, "code" | "name">): string {
  return toSlug(game.code) || toSlug(game.name) || `game-${game.code}`;
}

export type StoreInputFieldType =
  | "text"
  | "number"
  | "email"
  | "uid"
  | "server"
  | "charname"
  | "select";

export type MappedInputField = {
  fieldKey: string;
  fieldType: StoreInputFieldType;
  labelAr: string;
  labelEn: string;
  isRequired: boolean;
  sortOrder: number;
  options: { value: string; label_ar: string; label_en: string }[];
};

/**
 * Provider field keys mapped to GH Store field types and bilingual labels.
 *
 * `/v1/games/fields` returns bare keys such as `userid` or `serverid` with no
 * labels, so the wording lives here. An unrecognised key still becomes a usable
 * text field rather than being dropped — losing a required field would let an
 * order be placed without the data the supplier needs.
 */
const FIELD_DEFINITIONS: Record<string, { type: StoreInputFieldType; ar: string; en: string }> = {
  userid: { type: "uid", ar: "معرّف الحساب (ID)", en: "Player ID" },
  user_id: { type: "uid", ar: "معرّف الحساب (ID)", en: "Player ID" },
  playerid: { type: "uid", ar: "معرّف اللاعب", en: "Player ID" },
  player_id: { type: "uid", ar: "معرّف اللاعب", en: "Player ID" },
  serverid: { type: "server", ar: "السيرفر", en: "Server" },
  server_id: { type: "server", ar: "السيرفر", en: "Server" },
  server: { type: "server", ar: "السيرفر", en: "Server" },
  zoneid: { type: "server", ar: "المنطقة (Zone)", en: "Zone ID" },
  zone_id: { type: "server", ar: "المنطقة (Zone)", en: "Zone ID" },
  charname: { type: "charname", ar: "اسم الشخصية", en: "Character name" },
  character: { type: "charname", ar: "اسم الشخصية", en: "Character name" },
  email: { type: "email", ar: "البريد الإلكتروني", en: "Email" },
};

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

export function mapInputFields(
  fields: G2BulkGameFields,
  servers: G2BulkGameServers | null,
): MappedInputField[] {
  const serverOptions = Object.entries(servers?.servers ?? {}).map(([label, value]) => ({
    value,
    label_ar: label,
    label_en: label,
  }));

  return fields.info.fields
    .map((rawKey) => rawKey.trim())
    .filter((rawKey) => rawKey.length > 0)
    .map((rawKey, index) => {
      const key = rawKey.toLowerCase();
      const definition = FIELD_DEFINITIONS[key];
      const fieldType = definition?.type ?? "text";
      const isServerField = fieldType === "server";

      return {
        fieldKey: key,
        // A server field with no options cannot be a dropdown, so it stays a
        // free-text entry the customer can fill from the game client.
        fieldType: isServerField && serverOptions.length === 0 ? "text" : fieldType,
        labelAr: definition?.ar ?? humanizeKey(rawKey),
        labelEn: definition?.en ?? humanizeKey(rawKey),
        // Every key returned by /games/fields is required by the supplier.
        isRequired: true,
        sortOrder: index,
        options: isServerField ? serverOptions : [],
      };
    });
}

/** Whether the provider's field list means this game needs a server value. */
export function requiresServer(fields: G2BulkGameFields): boolean {
  return fields.info.fields.some((field) => {
    const key = field.trim().toLowerCase();
    return FIELD_DEFINITIONS[key]?.type === "server";
  });
}
