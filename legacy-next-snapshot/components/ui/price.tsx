import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format/money";

/**
 * Price display.
 *
 * A struck-through original price is wrapped in `<s>` so assistive tech
 * announces it as superseded, and the discount is stated in words rather than
 * being implied by colour alone.
 */
export type PriceProps = {
  amount: number;
  currency: string;
  locale: Locale;
  originalAmount?: number | null;
  discountPercent?: number | null;
  discountLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const AMOUNT_CLASSES = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-[clamp(1.5rem,3vw,2rem)]",
} as const;

export function Price({
  amount,
  currency,
  locale,
  originalAmount,
  discountPercent,
  discountLabel,
  size = "md",
  className,
}: PriceProps) {
  const hasOriginal = typeof originalAmount === "number" && originalAmount > amount;

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2.5 gap-y-1", className)}>
      <span
        className={cn("font-semibold tracking-tight text-[var(--ink)] tabular-nums", AMOUNT_CLASSES[size])}
      >
        {formatPrice(amount, currency, locale)}
      </span>
      {hasOriginal ? (
        <s className="text-sm text-[var(--ink-muted)] tabular-nums">
          {formatPrice(originalAmount, currency, locale)}
        </s>
      ) : null}
      {discountPercent && discountLabel ? (
        <Badge tone="sale" className="self-center">
          {discountLabel}
        </Badge>
      ) : null}
    </div>
  );
}
