import { describe, expect, it } from "vitest";
import { toHeaderWalletRows } from "@/lib/wallet-panel";

describe("header wallet rows", () => {
  const base = { email: null as string | null, username: null as string | null };

  it("falls back through full name, username, then email for the label", () => {
    const rows = toHeaderWalletRows([
      { ...base, id: "1", fullName: null, balance: 1, currency: "USD" },
      { ...base, id: "2", fullName: "", username: "sami", balance: 2, currency: "USD" },
      { ...base, id: "3", fullName: null, email: "a@b.c", balance: 3, currency: "USD" },
      { ...base, id: "4", fullName: "Sami K.", username: "sami", balance: 4, currency: "USD" },
    ]);

    // Richest first, per the mapping rules — labels follow their balances.
    expect(rows.map((row) => row.label)).toEqual(["Sami K.", "a@b.c", "sami", "—"]);
  });

  it("orders richest first", () => {
    const rows = toHeaderWalletRows([
      { id: "1", fullName: "A", ...base, balance: 5, currency: "USD" },
      { id: "2", fullName: "B", ...base, balance: 50, currency: "USD" },
      { id: "3", fullName: "C", ...base, balance: -2, currency: "USD" },
    ]);

    expect(rows.map((row) => row.balance)).toEqual([50, 5, -2]);
  });

  it("reads a missing wallet as zero dollars", () => {
    const rows = toHeaderWalletRows([
      // `null` mirrors the dashboard mapper: no wallet row yet.
      { id: "1", fullName: "A", ...base, balance: null as unknown as number, currency: "" },
    ]);

    expect(rows[0]).toMatchObject({ balance: 0, currency: "USD" });
  });
});
