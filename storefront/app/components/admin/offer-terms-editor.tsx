import { useState } from "react";
import { SelectField, TextField } from "@/components/admin/admin-form";
import type { OfferTerms } from "@/lib/catalog/offer-terms";
import { formatOfferTerms } from "@/lib/catalog/offer-terms";
export function OfferTermsEditor({ locale, prefix, terms }: { locale: "ar" | "en"; prefix: string; terms?: OfferTerms & { terms_source?: string; terms_review_note?: string | null; terms_reviewed_at?: string | null } }) {
  const ar = locale === "ar";
  const [source, setSource] = useState(terms?.terms_source ?? "automatic");
  const units = ["hour", "day", "month", "year"].map((value, i) => ({ value, label: ar ? ["ساعة", "يوم", "شهر", "سنة"][i] : value }));
  const unstated = source === "unstated";
  return <details className="mb-5 rounded-xl border border-[var(--line)] p-4" open={terms?.terms_review_required || undefined}>
    <summary className="cursor-pointer text-sm font-semibold">{ar ? "مدة الاشتراك والضمان" : "Subscription and warranty"}{terms?.terms_review_required ? (ar ? " · يحتاج مراجعة" : " · Needs review") : ""}</summary>
    <p className="my-3 text-xs text-[var(--ink-muted)]">{formatOfferTerms(terms, locale).map(f => `${f.label}: ${f.value}`).join(" · ") || (ar ? "لم يحدد المورد شروطاً واضحة" : "Supplier has not specified clear terms")}</p>
    <label className="grid gap-2 text-sm">{ar ? "مصدر المعلومات" : "Source"}<select className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3" name={`${prefix}.termsSource`} value={source} onChange={e => setSource(e.target.value)}><option value="automatic">{ar ? "استنتاج من اسم ووصف المنتج والعرض" : "Extract from product and offer text"}</option><option value="manual">{ar ? "تحديد يدوي محفوظ أثناء المزامنة" : "Manual override, preserved during sync"}</option><option value="unstated">{ar ? "المورد لا يذكر شروطاً (بدون ضمان مُختلق)" : "Supplier states no terms (no invented warranty)"}</option></select></label>
    {unstated ? <p className="mt-2 text-xs text-[var(--ink-muted)]">{ar ? "لن يُطلب منك تحديد مدة أو ضمان. سيعرض المتجر أن المورد لا يذكر شروطاً." : "You will not be asked for a duration or warranty. The storefront will say the supplier states none."}</p> : null}
    <fieldset disabled={source !== "manual"} className="mt-4 grid gap-3 sm:grid-cols-2 disabled:opacity-60">
      <TextField name={`${prefix}.durationValue`} type="number" min={1} max={1200} step={1} label={ar ? "مدة الاشتراك" : "Subscription length"} defaultValue={terms?.duration_value ?? ""} />
      <SelectField name={`${prefix}.durationUnit`} label={ar ? "وحدة الاشتراك" : "Subscription unit"} options={units} defaultValue={terms?.duration_unit ?? "month"} />
      <SelectField name={`${prefix}.warrantyKind`} label={ar ? "نوع الضمان" : "Warranty"} options={[{ value: "unknown", label: ar ? "غير محدد" : "Unspecified" },{ value: "none", label: ar ? "بدون ضمان (0 أيام)" : "No warranty (0 days)" },{ value: "fixed", label: ar ? "مدة محددة" : "Fixed duration" },{ value: "full", label: ar ? "طوال الاشتراك" : "Full subscription term" }]} defaultValue={terms?.warranty_kind ?? "unknown"} />
      <TextField name={`${prefix}.warrantyValue`} type="number" min={1} max={1200} step={1} label={ar ? "مدة الضمان المحدد" : "Fixed warranty length"} defaultValue={terms?.warranty_value || ""} />
      <SelectField name={`${prefix}.warrantyUnit`} label={ar ? "وحدة الضمان" : "Warranty unit"} options={units} defaultValue={terms?.warranty_unit ?? "day"} />
    </fieldset>
    {/* A resolution is a judgement about the supplier, so it carries a reason. */}
    {source === "automatic" ? null : <div className="mt-4 grid gap-2 text-sm">
      <TextField name={`${prefix}.termsReviewNote`} maxLength={500} label={unstated ? (ar ? "لماذا يذكر المورد شروطاً غير واضحة؟" : "Why is the supplier's wording unclear?") : (ar ? "ملاحظة المراجعة" : "Review note")} hint={unstated ? (ar ? "مطلوب. مثال: صفحة المورد تذكر المدة فقط، ولا تذكر أي ضمان." : "Required. For example: the supplier page lists the duration only and states no warranty.") : undefined} defaultValue={terms?.terms_review_note ?? ""} />
    </div>}
    {terms?.terms_reviewed_at ? <p className="mt-2 text-xs text-[var(--ink-muted)]">{ar ? "آخر مراجعة:" : "Last resolved:"} {new Date(terms.terms_reviewed_at).toLocaleString(locale)}</p> : null}
  </details>;
}
