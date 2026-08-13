import { describe, expect, it } from "vitest";
import { safeFilterTerm } from "@/lib/supabase/filters";

describe("safe filter term", () => {
  it("keeps an ordinary search untouched", () => {
    expect(safeFilterTerm("ahmed@example.com")).toBe("ahmed@example.com");
    expect(safeFilterTerm("GH-2026-0001")).toBe("GH-2026-0001");
  });

  it("trims the surrounding whitespace", () => {
    expect(safeFilterTerm("  ahmed  ")).toBe("ahmed");
  });

  it("removes the characters PostgREST reads as filter syntax", () => {
    // A comma would end the value and start another filter clause; a closing
    // parenthesis would end the whole `or=(...)` group.
    expect(safeFilterTerm("a,b")).not.toContain(",");
    expect(safeFilterTerm("x),role.eq.admin")).not.toContain(")");
    expect(safeFilterTerm(`he said "hi"`)).not.toContain('"');
    expect(safeFilterTerm("back\\slash")).not.toContain("\\");
  });

  it("removes the like wildcards, so a term matches itself and not everything", () => {
    expect(safeFilterTerm("100%")).toBe("100");
    expect(safeFilterTerm("a_b")).toBe("a b");
    expect(safeFilterTerm("*")).toBe("");
  });

  it("separates rather than joins the words it splits", () => {
    expect(safeFilterTerm("ahmed,ali")).toBe("ahmed ali");
  });

  it("returns empty when nothing searchable is left", () => {
    expect(safeFilterTerm("(),")).toBe("");
    expect(safeFilterTerm("   ")).toBe("");
  });
});
