type ClassValue = string | number | null | undefined | false;

/** Join conditional class names, dropping anything falsy. */
export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string | number => Boolean(value)).join(" ");
}
