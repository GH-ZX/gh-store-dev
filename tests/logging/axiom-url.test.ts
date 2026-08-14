import { describe, expect, it } from "vitest";
import { axiomIngestUrl } from "@/lib/settings/axiom-settings";

describe("axiom ingest URL", () => {
  it("uses the dataset path on the API host", () => {
    /*
     * Verified against the live API: the API host answers 200 here and 404
     * "path /v1/ingest/gh-store was not found" for the edge form. Axiom's
     * send-data page documents only the edge form, which is what got this
     * wrong the first time.
     */
    expect(axiomIngestUrl("api.axiom.co", "gh-store")).toBe(
      "https://api.axiom.co/v1/datasets/gh-store/ingest",
    );
  });

  it("uses the short path on an edge deployment host", () => {
    expect(axiomIngestUrl("us-east-1.aws.edge.axiom.co", "gh-store")).toBe(
      "https://us-east-1.aws.edge.axiom.co/v1/ingest/gh-store",
    );
  });

  it("accepts a host pasted with its scheme or a trailing slash", () => {
    expect(axiomIngestUrl("https://api.axiom.co/", "gh-store")).toBe(
      "https://api.axiom.co/v1/datasets/gh-store/ingest",
    );
    expect(axiomIngestUrl("  https://us-east-1.aws.edge.axiom.co  ", "gh-store")).toBe(
      "https://us-east-1.aws.edge.axiom.co/v1/ingest/gh-store",
    );
  });

  it("handles the EU API host like any other API host", () => {
    expect(axiomIngestUrl("api.eu.axiom.co", "gh-store")).toBe(
      "https://api.eu.axiom.co/v1/datasets/gh-store/ingest",
    );
  });

  it("escapes a dataset name that would otherwise break the path", () => {
    expect(axiomIngestUrl("api.axiom.co", "gh store/prod")).toBe(
      "https://api.axiom.co/v1/datasets/gh%20store%2Fprod/ingest",
    );
  });

  it("falls back to the default dataset rather than building a pathless URL", () => {
    expect(axiomIngestUrl("api.axiom.co", "   ")).toBe(
      "https://api.axiom.co/v1/datasets/gh-store/ingest",
    );
  });
});
