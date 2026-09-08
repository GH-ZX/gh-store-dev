/**
 * Whether a value carries anything, looking through nested objects and arrays.
 *
 * Axiom returns every column a dataset has ever seen, nulled where the event did
 * not set it, so a three-field event comes back with thirty keys. Emptiness has
 * to be judged through nesting rather than at the top: a column written by an
 * earlier event shape arrives as an object of nothing but nulls, not as a null,
 * and would otherwise be shown on every row for ever.
 *
 * Falsy is not empty. `0`, `false` and `""` are answers, and an event that
 * reports `refunded: false` is saying something worth reading.
 *
 * Outside the query module so it can be tested: that module imports
 * `server-only`, which cannot be loaded by the test runner.
 */
export function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasContent);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasContent);
  }

  return true;
}

/**
 * The number out of a `summarize count()` answer, or `null` if it is not there.
 *
 * An aggregate does not come back where a row does. A legacy-format query puts
 * matched rows in `matches` and aggregate results in `buckets.totals`, so the
 * count is read from the latter — with the former tried as well, since only the
 * ingest half of this API's contract has ever been verified against the real
 * service and a wrong guess here should not cost anything.
 *
 * Returning `null` rather than `0` is the whole point. `0` is a claim that the
 * dataset is empty; `null` says the answer was unreadable, which lets the caller
 * show the list without a total instead of a total that might be a lie.
 */
export function readCount(body: unknown): number | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const root = body as Record<string, unknown>;
  const buckets = root.buckets as { totals?: unknown } | undefined;
  const totals = Array.isArray(buckets?.totals) ? buckets.totals : [];

  for (const total of totals) {
    const aggregations = (total as { aggregations?: unknown })?.aggregations;

    if (!Array.isArray(aggregations)) {
      continue;
    }

    for (const aggregation of aggregations) {
      const value = (aggregation as { value?: unknown })?.value;

      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
  }

  // Some shapes hand the aggregate back as an ordinary row instead.
  const matches = Array.isArray(root.matches) ? root.matches : [];
  const row = matches[0] as { data?: unknown } | undefined;
  const data = (row?.data && typeof row.data === "object" ? row.data : row) as
    | Record<string, unknown>
    | undefined;

  for (const value of Object.values(data ?? {})) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}
