/**
 * Turning a name into a URL segment.
 *
 * A slug is the public address of a game or a package, so it has to be typeable,
 * stable, and free of anything a URL would have to escape. Imported products get
 * theirs from the supplier's own code; a hand-made one is derived from the name
 * the owner typed, which is the only other thing they have already said.
 *
 * Arabic is transliterated by nobody here — a name written only in Arabic
 * produces an empty slug, and the caller is expected to ask for one rather than
 * invent `game-1`. An address is a decision, and a generated one that nobody
 * chose is the sort of thing that ends up permanent.
 */

/** Removed rather than separated: "Assassin's" is one word, not two. */
const ELISION = /['’`"]+/g;
const SEPARATORS = /[\s_/\\.,:;!?()[\]{}]+/g;
const UNSAFE = /[^a-z0-9-]/g;
const REPEATED_DASH = /-{2,}/g;
const EDGE_DASH = /^-+|-+$/g;

/** Long enough for "playstation-network-card-50-usd", short enough to read. */
export const SLUG_MAX = 60;

export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    // Accented Latin becomes its base letter rather than disappearing.
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(ELISION, "")
    .replace(SEPARATORS, "-")
    .replace(UNSAFE, "")
    .replace(REPEATED_DASH, "-")
    .replace(EDGE_DASH, "")
    .slice(0, SLUG_MAX)
    .replace(EDGE_DASH, "");
}

/** Whether a slug is one this store is willing to put in a URL. */
export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= SLUG_MAX && toSlug(value) === value;
}
