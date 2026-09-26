import { describe, expect, it } from "vitest";
import { formatOfferTerms, offerTermsInputSchema, offerTermsUpdate, readableOfferName } from "@/lib/catalog/offer-terms";

const parse = (input: Record<string, unknown>) => offerTermsInputSchema.parse(input);
const manual = { termsSource: "manual", durationValue: 1, durationUnit: "month", warrantyKind: "full", warrantyValue: null, warrantyUnit: "day" };

describe("resolving a terms review without inventing a warranty", () => {
  it("records a reason when the supplier genuinely states nothing", () => {
    expect(offerTermsInputSchema.safeParse({ termsSource: "unstated" }).success).toBe(false);
    const input = parse({ termsSource: "unstated", termsReviewNote: "Supplier page lists a duration only." });
    expect(input.termsReviewNote).toBe("Supplier page lists a duration only.");
  });

  it("clears the flag and claims neither a duration nor a warranty", () => {
    const update = offerTermsUpdate(parse({ termsSource: "unstated", termsReviewNote: "No terms published." }), "admin-1");
    expect(update).toMatchObject({
      terms_source: "unstated", terms_review_required: false,
      duration_value: null, duration_unit: null,
      warranty_kind: "unknown", warranty_value: null, warranty_unit: null,
      terms_reviewed_by: "admin-1", terms_review_note: "No terms published.",
    });
    expect(update.terms_reviewed_at).toEqual(expect.any(String));
  });

  it("refuses to guess even if a stray duration is submitted alongside it", () => {
    const update = offerTermsUpdate(parse({ termsSource: "unstated", termsReviewNote: "None published.", durationValue: 3, warrantyKind: "fixed", warrantyValue: 30 }));
    expect(update.warranty_kind).toBe("unknown");
    expect(update.warranty_value).toBeNull();
    expect(update.duration_value).toBeNull();
  });

  it("stamps the reviewer for a manual override too", () => {
    expect(offerTermsUpdate(parse(manual), "admin-2")).toMatchObject({ terms_source: "manual", terms_reviewed_by: "admin-2", terms_review_required: false });
  });

  it("hands an offer back to the parser and drops stale provenance", () => {
    const update = offerTermsUpdate(parse({ ...manual, termsSource: "automatic" }));
    expect(update).toMatchObject({ terms_source: "automatic", terms_reviewed_at: null, terms_reviewed_by: null, terms_review_note: null });
  });

  it("survives a save with no reviewer identity", () => {
    expect(offerTermsUpdate(parse({ termsSource: "unstated", termsReviewNote: "None." }))).toMatchObject({ terms_reviewed_by: null });
  });
});

describe("what a customer is told", () => {
  it("still defers an unresolved offer to support", () => {
    expect(formatOfferTerms({ terms_review_required: true }, "en")[0].value).toContain("Confirm duration and warranty");
  });

  it("states the absence instead of implying a warranty", () => {
    const terms = { terms_source: "unstated", warranty_kind: "unknown", duration_value: null, terms_review_required: false };
    expect(formatOfferTerms(terms, "en")).toEqual([{ label: "Terms", value: "The supplier states no duration or warranty" }]);
    expect(formatOfferTerms(terms, "ar")[0].value).toBe("المورّد لا يذكر مدة أو ضمانًا");
  });

  it("keeps supplier shorthand while the terms are unknown", () => {
    // Only warranty shorthand is ever stripped, and only once a fact replaces it.
    // "1M" is a duration claim nobody has confirmed, so it stays either way.
    expect(readableOfferName("Spotify Premium 1M FW", { terms_source: "unstated", warranty_kind: "unknown" })).toBe("Spotify Premium 1M FW");
    expect(readableOfferName("Spotify Premium 1M FW", { terms_source: "manual", warranty_kind: "full", duration_value: 1, duration_unit: "month" })).toBe("Spotify Premium 1M");
    expect(readableOfferName("Spotify Premium 1M FW", { terms_review_required: true })).toBe("Spotify Premium 1M FW");
  });
});
