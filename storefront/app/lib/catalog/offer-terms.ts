import { z } from "zod";
import type { Locale } from "@/i18n/config";

export type OfferTerms = {
  duration_value?: number | null;
  duration_unit?: string | null;
  warranty_kind?: string;
  warranty_value?: number | null;
  warranty_unit?: string | null;
  terms_review_required?: boolean;
};
const unit = z.enum(["hour", "day", "month", "year"]);
const optionalNumber = z.preprocess(v => v === "" || v == null ? null : Number(v), z.number().int().min(1).max(1200).nullable());
export const offerTermsInputSchema = z.object({
  termsSource: z.enum(["automatic", "manual"]).default("automatic"),
  durationValue: optionalNumber,
  durationUnit: unit.default("month"),
  warrantyKind: z.enum(["unknown", "none", "fixed", "full"]).default("unknown"),
  warrantyValue: optionalNumber,
  warrantyUnit: unit.default("day"),
}).refine(v => v.termsSource !== "manual" || (v.warrantyKind !== "fixed" || v.warrantyValue !== null) && (v.warrantyKind !== "full" || v.durationValue !== null), { message: "Fixed warranty needs a length; full warranty needs a subscription duration." });

export function offerTermsUpdate(input: z.infer<typeof offerTermsInputSchema>) {
  if (input.termsSource === "automatic") return { terms_source: "automatic" };
  return {
    terms_source: "manual",
    duration_value: input.durationValue,
    duration_unit: input.durationValue === null ? null : input.durationUnit,
    warranty_kind: input.warrantyKind,
    warranty_value: input.warrantyKind === "none" ? 0 : input.warrantyKind === "fixed" ? input.warrantyValue : null,
    warranty_unit: input.warrantyKind === "none" ? "day" : input.warrantyKind === "fixed" ? input.warrantyUnit : null,
    terms_review_required: false,
  };
}

export function formatOfferTerms(terms: OfferTerms | undefined, locale: Locale): { label: string; value: string }[] {
  if (!terms) return [];
  const ar = locale === "ar";
  if (terms.terms_review_required) return [{ label: ar ? "الشروط" : "Terms", value: ar ? "يرجى تأكيد المدة والضمان مع الدعم قبل الشراء" : "Confirm duration and warranty with support before purchasing" }];
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
