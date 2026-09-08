/**
 * Universal import types.
 *
 * Every provider's catalogue is normalised into these shapes before it reaches
 * the import form. The form itself only knows about lanes, items, and categories
 * — never about MaxStore's API structure or G2Bulk's code scheme.
 */

export type ImportItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  price?: number;
  stockCount?: number | null;
  available: boolean;
  alreadyImported: boolean;
  providerCode: string;
  /** Store category this item already sits in (BatStore sets this on import). */
  currentCategoryId?: string | null;
  /** Category name from the API, used to auto-match against store categories. */
  categoryName?: string | null;
};

export type ImportLane = {
  id: string;
  name: string;
  hasStock: boolean;
  alreadyImported: boolean;
  providerCode: string;
  items: ImportItem[];
};

export type ImportFormMode = "flat" | "grouped";

export type ImportFormSummary = {
  created: number;
  updated: number;
  failed: number;
  itemsCreated: number;
  itemsUpdated: number;
  errors: Array<{ name: string; error: string }>;
};

export type ImportActionState = {
  error: string | null;
  summary: ImportFormSummary | null;
};
