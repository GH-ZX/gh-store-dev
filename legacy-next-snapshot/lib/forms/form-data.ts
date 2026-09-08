/**
 * FormData readers.
 *
 * `FormData.get` returns `null` for a field that is not present, and `null` is
 * not `undefined` to a schema: `z.string().optional()` accepts a missing value
 * but rejects an explicit null. Reading fields through these helpers keeps that
 * mismatch out of every action — it is exactly the bug that made sign-in fail
 * whenever the optional redirect field was absent.
 */

/** A text field, or undefined when absent or empty. */
export function formText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);

  if (typeof value !== "string") {
    return undefined;
  }

  return value.length > 0 ? value : undefined;
}

/** A checkbox: browsers submit "on" only when it is checked. */
export function formFlag(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/** Every value submitted under one name, ignoring file entries. */
export function formTextList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .filter((value) => value.length > 0);
}
