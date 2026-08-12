import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)] ${className}`}
      {...props}
    />
  );
}
