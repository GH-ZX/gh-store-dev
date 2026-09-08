/** Keep a checkout's amount and return link while the customer chooses how to pay. */
export function rechargeHref(
  path: string,
  context: { amount?: number | null; returnTo?: string | null; method?: string | null } = {},
): string {
  const search = new URLSearchParams();
  if (context.amount !== null && context.amount !== undefined) search.set("amount", context.amount.toFixed(2));
  if (context.returnTo) search.set("returnTo", context.returnTo);
  if (context.method) search.set("method", context.method);
  return search.size ? `${path}?${search}` : path;
}

/** A suggested amount remains editable and must fit the configured recharge limits. */
export function rechargeAmount(value: string | null, min: number, max: number): number | null {
  if (!value?.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.min(max, Math.max(min, Math.round((amount + Number.EPSILON) * 100) / 100));
}
