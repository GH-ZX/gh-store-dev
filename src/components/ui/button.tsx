import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className = "", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-5 text-sm font-semibold transition-transform duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${
        variant === "primary"
          ? "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
          : variant === "secondary"
            ? "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      } ${className}`}
      {...props}
    />
  );
}
