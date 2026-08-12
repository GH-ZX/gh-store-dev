import { describe, expect, it } from "vitest";
import { classifyStatus, G2BulkAuthError } from "@/providers/g2bulk/errors";
import {
  gameCatalogueSchema,
  gameFieldsSchema,
  gameServersSchema,
  gamesSchema,
  getMeSchema,
  productsSchema,
} from "@/providers/g2bulk/schemas";

/**
 * The payloads below are the documented examples from
 * `docs/providers/g2bulk-api.md`. If the provider contract changes, these fail
 * first — which is the point.
 */

describe("documented response shapes", () => {
  it("accepts the getMe example", () => {
    expect(
      getMeSchema.parse({
        success: true,
        user_id: 123456789,
        username: "johndoe",
        first_name: "John Doe",
        balance: 8.74,
      }).balance,
    ).toBe(8.74);
  });

  it("accepts the games example", () => {
    const parsed = gamesSchema.parse({
      success: true,
      games: [
        { id: 1, code: "pubg_mobile", name: "PUBG Mobile", image_url: "/images/pubg_mobile.png" },
        { id: 2, code: "free_fire", name: "Free Fire", image_url: "/images/free_fire.png" },
      ],
    });

    expect(parsed.games).toHaveLength(2);
  });

  it("accepts the catalogue example", () => {
    const parsed = gameCatalogueSchema.parse({
      success: true,
      game: { code: "pubgm", name: "PUBG Mobile", image_url: "/images/pubgm.png" },
      catalogues: [
        { id: 1, name: "60 UC", amount: 0.88 },
        { id: 2, name: "120 UC", amount: 1.75 },
      ],
    });

    expect(parsed.catalogues[1]).toEqual({ id: 2, name: "120 UC", amount: 1.75 });
  });

  it("accepts the fields example, which answers with code not success", () => {
    const parsed = gameFieldsSchema.parse({
      code: "200",
      info: { fields: ["userid", "serverid"], notes: "Not available for Indonesia users" },
    });

    expect(parsed.info.fields).toEqual(["userid", "serverid"]);
  });

  it("accepts the servers example as a label-to-value map", () => {
    const parsed = gameServersSchema.parse({
      code: "200",
      servers: { "SouthEast Asia": "SouthEast Asia", America: "America", Europe: "Europe" },
    });

    expect(Object.keys(parsed.servers)).toHaveLength(3);
  });

  it("accepts the products example", () => {
    const parsed = productsSchema.parse({
      success: true,
      products: [
        {
          id: 1,
          title: "60 UC Voucher",
          description: "",
          category_id: 1,
          category_title: "PUBG Mobile UC Vouchers",
          unit_price: 0.84,
          face_value: 1,
          image_url: null,
          stock: 1006,
        },
      ],
    });

    expect(parsed.products[0].unit_price).toBe(0.84);
  });

  it("rejects a failure envelope rather than treating it as data", () => {
    expect(gamesSchema.safeParse({ success: false, message: "nope" }).success).toBe(false);
  });

  it("rejects a negative supplier cost", () => {
    expect(
      gameCatalogueSchema.safeParse({
        success: true,
        game: { code: "x", name: "X" },
        catalogues: [{ id: 1, name: "A", amount: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe("error classification", () => {
  it("treats an auth failure as never retryable", () => {
    const error = classifyStatus(401, "bad key");

    expect(error).toBeInstanceOf(G2BulkAuthError);
    expect(error.retryable).toBe(false);
  });

  it("treats a 403 as an auth failure too", () => {
    expect(classifyStatus(403, "forbidden").kind).toBe("auth");
  });

  it("marks rate limiting and server faults retryable", () => {
    expect(classifyStatus(429, "slow down").retryable).toBe(true);
    expect(classifyStatus(503, "unavailable").retryable).toBe(true);
  });

  it("marks other client errors as non-retryable requests", () => {
    const error = classifyStatus(400, "bad request");

    expect(error.kind).toBe("request");
    expect(error.retryable).toBe(false);
  });
});
