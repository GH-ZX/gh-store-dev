import { useState, useTransition } from "react";
import { useFetcher } from "react-router";
import type { Locale } from "@/i18n/config";
import { HeartIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export interface WishlistButtonProps {
  productId: string;
  locale: Locale;
  initialWishlisted?: boolean;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}

function useSafeFetcher() {
  try {
    return useFetcher();
  } catch {
    return {
      state: "idle" as const,
      formData: undefined,
      data: undefined,
      submit: () => {},
      Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    } as any;
  }
}

export function WishlistButton({
  productId,
  locale,
  initialWishlisted = false,
  className,
  showLabel = false,
  size = "md",
}: WishlistButtonProps) {
  const fetcher = useSafeFetcher();
  const [isWishlisted, setIsWishlisted] = useState(initialWishlisted);
  const [, startTransition] = useTransition();

  const isAr = locale === "ar";
  const optimisticWishlisted =
    fetcher.formData?.get("action") === "toggle"
      ? !isWishlisted
      : isWishlisted;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    startTransition(() => {
      setIsWishlisted((prev) => !prev);
    });

    fetcher.submit(
      { action: "toggle", productId },
      { method: "post", action: `/${locale}/account/wishlist` },
    );
  };

  const label = optimisticWishlisted
    ? isAr
      ? "في قائمة الرغبات"
      : "Wishlisted"
    : isAr
      ? "أضف للرغبات"
      : "Add to wishlist";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={optimisticWishlisted}
      title={label}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer",
        size === "sm"
          ? "size-8 rounded-full bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-strong)] shadow-xs"
          : "min-h-10 px-3 rounded-[var(--radius-control,10px)] border border-[var(--line)] bg-[var(--surface)] text-sm font-medium hover:bg-[var(--surface-strong)]",
        optimisticWishlisted && "text-[var(--danger,#e03131)]",
        className,
      )}
    >
      <HeartIcon
        filled={optimisticWishlisted}
        className={cn(
          size === "sm" ? "size-4" : "size-4.5",
          optimisticWishlisted && "text-[var(--danger,#e03131)]",
        )}
      />
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
