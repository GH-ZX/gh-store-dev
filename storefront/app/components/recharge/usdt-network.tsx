/** Brand marks are decorative; adjacent text identifies both asset and network. */
export function UsdtNetwork({ locale }: { locale: "ar" | "en" }) {
  return <div className="sf-usdt-network flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)] p-4">
    <svg viewBox="0 0 40 40" className="size-12 shrink-0" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#26a17b"/><path fill="#fff" d="M11 9h18v5h-6v4c6 .3 10 1.3 10 3s-4 2.7-10 3v9h-6v-9c-6-.3-10-1.3-10-3s4-2.7 10-3v-4h-6zm9 14c6.6 0 12-1 12-2s-3.8-1.8-9-2v3h-6v-3c-5.2.2-9 1-9 2s5.4 2 12 2"/></svg>
    <div className="min-w-0"><p className="text-lg font-bold" dir="ltr">USDT <span className="text-sm font-normal text-[var(--ink-muted)]">Tether</span></p>
      <p className="sf-usdt-network flex items-center gap-2 text-sm font-medium"><svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true"><path fill="#f0b90b" d="m12 0 5 5-3 3-2-2-2 2-3-3zm7 7 5 5-5 5-3-3 2-2-2-2zM5 7l3 3-2 2 2 2-3 3-5-5zm7 2 3 3-3 3-3-3zm-2 7 2 2 2-2 3 3-5 5-5-5z"/></svg><span dir="ltr">BNB Smart Chain · BEP20</span></p>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">{locale === "ar" ? "اختر هذه الشبكة في تطبيق السحب" : "Select this network in your withdrawal app"}</p>
    </div>
  </div>;
}
