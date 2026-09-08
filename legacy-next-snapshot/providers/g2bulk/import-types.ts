/**
 * Import result shapes.
 *
 * Kept separate from the import service, which is `server-only`: the admin UI
 * needs to render these results, and a shared type module lets it do that
 * without pulling a server module into its graph.
 */

export type ImportGameOutcome = {
  code: string;
  name: string;
  status: "created" | "updated" | "failed";
  offersCreated: number;
  offersUpdated: number;
  /** Offers parked because the provider no longer lists them. */
  offersDeactivated: number;
  error?: string;
};

export type ImportSummary = {
  logId: string | null;
  requested: number;
  created: number;
  updated: number;
  failed: number;
  offersCreated: number;
  offersUpdated: number;
  offersDeactivated: number;
  outcomes: ImportGameOutcome[];
};

export type ImportOptions = {
  /** Publish imported games and offers immediately. */
  publish: boolean;
  markupPercent: number;
};
