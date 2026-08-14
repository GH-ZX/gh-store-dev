import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons and button-shaped links.
 *
 * Both share {@link buttonClassName} so a link CTA and a form submit are
 * pixel-identical. Controls are pill-shaped with a minimum 44px target, and a
 * trailing icon sits in its own circular well rather than floating loose beside
 * the label.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "glass" | "dangerGhost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--elevation-2)] hover:bg-[var(--accent-strong)]",
  secondary:
    "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] hover:bg-[var(--surface-strong)]",
  ghost: "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
  dangerGhost: "text-[var(--danger)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)]",
  glass:
    "border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] text-[var(--ink)] backdrop-blur-xl hover:border-[var(--line-strong)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 px-4 text-[0.8125rem]",
  md: "min-h-11 gap-2 px-5 text-sm",
  lg: "min-h-13 gap-2.5 px-7 text-base",
};

const ICON_WELL_CLASSES: Record<ButtonSize, string> = {
  sm: "size-6",
  md: "size-7",
  lg: "size-8",
};

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered inside its own circular well at the end of the control. */
  trailingIcon?: ReactNode;
  leadingIcon?: ReactNode;
  fullWidth?: boolean;
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: SharedProps & { className?: string }): string {
  return cn(
    "inline-flex items-center justify-center rounded-[var(--radius-pill)] font-semibold tracking-tight",
    "transition-[background-color,border-color,color,transform,box-shadow] duration-[var(--duration)] ease-[var(--ease-spring)]",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && "w-full",
    className,
  );
}

function ButtonBody({
  size = "md",
  variant = "primary",
  leadingIcon,
  trailingIcon,
  children,
}: SharedProps & { children: ReactNode }) {
  return (
    <>
      {leadingIcon ? <span className="shrink-0 [&>svg]:size-[1.125rem]">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? (
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full [&>svg]:size-4",
            ICON_WELL_CLASSES[size],
            variant === "primary"
              ? "bg-[color-mix(in_srgb,var(--accent-ink)_14%,transparent)]"
              : "bg-[var(--shell)]",
          )}
        >
          {trailingIcon}
        </span>
      ) : null}
    </>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & SharedProps;

export function Button({
  className,
  variant = "primary",
  size = "md",
  fullWidth,
  leadingIcon,
  trailingIcon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={buttonClassName({ variant, size, fullWidth, className })} {...props}>
      <ButtonBody size={size} variant={variant} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonBody>
    </button>
  );
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  SharedProps & { href: string };

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  fullWidth,
  leadingIcon,
  trailingIcon,
  children,
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClassName({ variant, size, fullWidth, className })} {...props}>
      <ButtonBody size={size} variant={variant} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonBody>
    </Link>
  );
}
