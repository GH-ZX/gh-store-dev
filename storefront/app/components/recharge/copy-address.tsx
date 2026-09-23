import { useState } from "react";
export function CopyAddress({ value, locale }: { value: string; locale: "ar" | "en" }) {
  const [copied, setCopied] = useState(false);
  return <div className="grid gap-2"><code dir="ltr" className="break-all rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] p-3 text-sm select-all">{value}</code><button type="button" className="min-h-11 justify-self-start text-sm text-[var(--accent)]" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); } }}>{copied ? locale === "ar" ? "تم النسخ" : "Copied" : locale === "ar" ? "نسخ عنوان الاستلام" : "Copy receiving address"}</button><span role="status" className="sr-only">{copied ? locale === "ar" ? "تم النسخ" : "Copied" : ""}</span></div>;
}
