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
