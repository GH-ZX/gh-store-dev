import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { formatMessage, getMessages, type MessageNamespace } from "@/i18n/messages";

const NAMESPACES: MessageNamespace[] = ["common", "catalog", "home", "search", "content"];

/** Flatten a dictionary into sorted `a.b[0].c` key paths for comparison. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`));
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      keyPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  return [prefix];
}

function leafValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(leafValues);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(leafValues);
  }

  return [String(value)];
}

describe("message dictionaries", () => {
  it.each(NAMESPACES)("keeps the %s namespace identical across locales", (namespace) => {
    const arabic = keyPaths(getMessages("ar", namespace)).sort();
    const english = keyPaths(getMessages("en", namespace)).sort();

    expect(english).toEqual(arabic);
  });

  it.each(NAMESPACES)("has no blank strings in the %s namespace", (namespace) => {
    for (const locale of SUPPORTED_LOCALES) {
      const blanks = leafValues(getMessages(locale, namespace)).filter(
        (value) => value.trim().length === 0,
      );

      expect(blanks).toEqual([]);
    }
  });

  it("keeps Arabic and English copy distinct where it must differ", () => {
    expect(getMessages("ar", "common").navigation.games).not.toBe(
      getMessages("en", "common").navigation.games,
    );
  });
});

describe("message formatting", () => {
  it("fills placeholders", () => {
    expect(formatMessage("{count} games", { count: 12 })).toBe("12 games");
    expect(formatMessage("Results for “{query}”", { query: "uc" })).toBe("Results for “uc”");
  });

  it("leaves an unknown placeholder untouched rather than printing undefined", () => {
    expect(formatMessage("{a} and {b}", { a: "one" })).toBe("one and {b}");
  });

  it("formats numbers for the locale when one is given", () => {
    expect(formatMessage("{count}", { count: 1500 }, "en")).toBe("1,500");
  });
});
