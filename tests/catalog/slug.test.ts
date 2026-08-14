import { describe, expect, it } from "vitest";
import { isValidSlug, SLUG_MAX, toSlug } from "@/lib/catalog/slug";

describe("deriving a slug from a name", () => {
  it("lowercases and joins words with a dash", () => {
    expect(toSlug("PUBG Mobile")).toBe("pubg-mobile");
    expect(toSlug("  Free   Fire  ")).toBe("free-fire");
  });

  it("keeps digits, which most package names need", () => {
    expect(toSlug("PlayStation Network Card 50 USD")).toBe("playstation-network-card-50-usd");
  });

  it("drops punctuation rather than escaping it", () => {
    expect(toSlug("Assassin's Creed: Valhalla")).toBe("assassins-creed-valhalla");
    expect(toSlug("Call of Duty® Mobile")).toBe("call-of-duty-mobile");
  });

  it("reduces an accent to its base letter instead of losing the word", () => {
    expect(toSlug("Pokémon Café")).toBe("pokemon-cafe");
  });

  it("never leaves a dash at either end", () => {
    expect(toSlug("--Genshin--")).toBe("genshin");
    expect(toSlug("!!!")).toBe("");
  });

  it("returns nothing for a name with no Latin letters", () => {
    // Deliberate: an address is a decision, and inventing `game-1` for an
    // Arabic-only name would make a permanent URL nobody chose.
    expect(toSlug("ببجي موبايل")).toBe("");
  });

  it("stays within the length a URL segment should be", () => {
    const slug = toSlug("a".repeat(200));

    expect(slug.length).toBe(SLUG_MAX);
  });
});

describe("slugs we are willing to publish", () => {
  it("accepts what the deriver produces", () => {
    expect(isValidSlug("pubg-mobile")).toBe(true);
    expect(isValidSlug("60-uc")).toBe(true);
  });

  it("rejects anything that would have to be escaped or normalised", () => {
    expect(isValidSlug("PUBG Mobile")).toBe(false);
    expect(isValidSlug("pubg_mobile")).toBe(false);
    expect(isValidSlug("pubg/mobile")).toBe(false);
    expect(isValidSlug("-pubg")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});
