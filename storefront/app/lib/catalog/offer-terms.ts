import { z } from "zod";
import type { Locale } from "@/i18n/config";

export type OfferTerms = {
  duration_value?: number | null;
  duration_unit?: string | null;
  warranty_kind?: string;
  warranty_value?: number | null;
  warranty_unit?: string | null;
  terms_review_required?: boolean;
  terms_source?: string;
};
const unit = z.enum(["hour", "day", "month", "year"]);
const optionalNumber = z.preprocess(v => v === "" || v == null ? null : Number(v), z.number().int().min(1).max(1200).nullable());
const reviewNote = z.string().trim().max(500);
export const offerTermsInputSchema = z.object({
  termsSource: z.enum(["automatic", "manual", "unstated"]).default("automatic"),
  termsReviewNote: reviewNote.optional(),
  durationValue: optionalNumber,
  durationUnit: unit.default("month"),
  warrantyKind: z.enum(["unknown", "none", "fixed", "full"]).default("unknown"),
  warrantyValue: optionalNumber,
  warrantyUnit: unit.default("day"),
}).refine(v => v.termsSource !== "manual" || (v.warrantyKind !== "fixed" || v.warrantyValue !== null) && (v.warrantyKind !== "full" || v.durationValue !== null), { message: "Fixed warranty needs a length; full warranty needs a subscription duration." })
  // Declaring terms unstated is a judgement about the supplier, so it carries a reason.
  .refine(v => v.termsSource !== "unstated" || Boolean(v.termsReviewNote), { message: "Say why the supplier states no terms.", path: ["termsReviewNote"] });

export type OfferTermsResolution = {
  terms_source: "automatic" | "manual" | "unstated";
  duration_value: number | null;
  duration_unit: string | null;
  warranty_kind: string;
  warranty_value: number | null;
  warranty_unit: string | null;
  terms_review_required: boolean;
  terms_reviewed_at: string | null;
  terms_reviewed_by: string | null;
  terms_review_note: string | null;
};

export function offerTermsUpdate(input: z.infer<typeof offerTermsInputSchema>, reviewedBy?: string | null): OfferTermsResolution {
  const reviewedAt = new Date().toISOString();
  // Reverting to automatic hands the offer back to the parser, so any earlier
  // resolution no longer describes it.
  if (input.termsSource === "automatic") return {
    terms_source: "automatic", duration_value: null, duration_unit: null, warranty_kind: "unknown",
    warranty_value: null, warranty_unit: null, terms_review_required: false,
    terms_reviewed_at: null, terms_reviewed_by: null, terms_review_note: null,
  };
  // The supplier publishes no terms. There is no duration and no warranty claim,
  // which is a finding rather than a guess.
  if (input.termsSource === "unstated") return {
    terms_source: "unstated", duration_value: null, duration_unit: null, warranty_kind: "unknown",
    warranty_value: null, warranty_unit: null, terms_review_required: false,
    terms_reviewed_at: reviewedAt, terms_reviewed_by: reviewedBy ?? null, terms_review_note: input.termsReviewNote ?? null,
  };
  return {
    terms_source: "manual",
    duration_value: input.durationValue,
    duration_unit: input.durationValue === null ? null : input.durationUnit,
    warranty_kind: input.warrantyKind,
    warranty_value: input.warrantyKind === "none" ? 0 : input.warrantyKind === "fixed" ? input.warrantyValue : null,
    warranty_unit: input.warrantyKind === "none" ? "day" : input.warrantyKind === "fixed" ? input.warrantyUnit : null,
    terms_review_required: false,
    terms_reviewed_at: reviewedAt,
    terms_reviewed_by: reviewedBy ?? null,
    terms_review_note: input.termsReviewNote ?? null,
  };
}

export function formatOfferTerms(terms: OfferTerms | undefined, locale: Locale): { label: string; value: string }[] {
  if (!terms) return [];
  const ar = locale === "ar";
  if (terms.terms_review_required) return [{ label: ar ? "الشروط" : "Terms", value: ar ? "يرجى تأكيد المدة والضمان مع الدعم قبل الشراء" : "Confirm duration and warranty with support before purchasing" }];
  // Reviewed and genuinely absent: say so, rather than implying a warranty.
  if (terms.terms_source === "unstated") return [{ label: ar ? "الشروط" : "Terms", value: ar ? "المورّد لا يذكر مدة أو ضمانًا" : "The supplier states no duration or warranty" }];
  function duration(value: number | null | undefined, unit: string | null | undefined) {
    if (!value || !unit || !["hour", "day", "month", "year"].includes(unit)) return null;
    return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
  }
  const period = duration(terms.duration_value, terms.duration_unit);
  const warranty = terms.warranty_kind === "none" ? ar ? "بدون ضمان" : "No warranty"
    : terms.warranty_kind === "full" && period ? (ar ? "طوال مدة الاشتراك · " : "Full subscription term · ") + period
    : terms.warranty_kind === "fixed" ? duration(terms.warranty_value, terms.warranty_unit) : null;
  return [period ? { label: ar ? "مدة الاشتراك" : "Subscription", value: period } : null,
    warranty ? { label: ar ? "الضمان" : "Warranty", value: warranty } : null].filter((item): item is { label: string; value: string } => item !== null);
}

/** Remove supplier shorthand only when verified structured facts replace it. */
export function readableOfferName(name: string, terms?: OfferTerms) {
  if (!terms || terms.terms_review_required) return name;
  let clean = name;
  if (terms.warranty_kind && terms.warranty_kind !== "unknown") clean = clean.replace(/\b(?:nw|fw|w\s*\d+\s*[hdmy])\b/gi, " ");
  return clean.replace(/\s+/g, " ").trim() || name;
}
