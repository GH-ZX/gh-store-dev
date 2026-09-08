import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Admin form controls.
 *
 * Plain server-renderable inputs with one shared visual treatment, so every
 * dashboard form looks like the same product. Each control is wrapped in its own
 * label — no `htmlFor`/`id` pairs to keep in sync, and the whole row stays
 * clickable.
 *
 * Bilingual fields use `dir="ltr"` only where the value is genuinely Latin (a
 * slug, a URL, a number). Arabic content fields inherit the page direction.
 */

const CONTROL_CLASSES =
  "min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] disabled:opacity-50";

export function FieldShell({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-medium text-[var(--ink-soft)]">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-[var(--ink-faint)]">{hint}</span> : null}
    </label>
  );
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  fieldClassName?: string;
};

export function TextField({ label, hint, fieldClassName, className, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} className={fieldClassName}>
      <input className={cn(CONTROL_CLASSES, className)} {...props} />
    </FieldShell>
  );
}

export type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  fieldClassName?: string;
};

export function TextAreaField({
  label,
  hint,
  fieldClassName,
  className,
  rows = 3,
  ...props
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} className={fieldClassName}>
      <textarea rows={rows} className={cn(CONTROL_CLASSES, "py-2.5", className)} {...props} />
    </FieldShell>
  );
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  fieldClassName?: string;
  options: { value: string; label: string }[];
};

export function SelectField({
  label,
  hint,
  fieldClassName,
  className,
  options,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} className={fieldClassName}>
      <select className={cn(CONTROL_CLASSES, "pe-8", className)} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
};

export function CheckboxField({ label, hint, className, ...props }: CheckboxFieldProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-3 py-2.5",
        className,
      )}
    >
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" {...props} />
      <span className="min-w-0">
        <span className="block text-sm text-[var(--ink)]">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-5 text-[var(--ink-muted)]">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

/** Panel that groups one editable entity. */
export function AdminCard({
  title,
  description,
  actions,
  className,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const header = title || description || actions ? (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {title ? <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2> : null}
        {description ? <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  ) : null;

  if (collapsible) {
    return (
      <details
        open={defaultOpen}
        className={cn(
          "group rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)]",
          className,
        )}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{description}</p> : null}
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {actions ? <span className="flex flex-wrap gap-2">{actions}</span> : null}
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-muted)] transition-transform group-open:rotate-180">⌄</span>
          </span>
        </summary>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
      </details>
    );
  }

  return (
    <section
      className={cn(
        "rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6",
        className,
      )}
    >
      {header}
      {children}
    </section>
  );
}

/** Inline result banner for an admin form. */
export function FormResult({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (!error && !notice) {
    return null;
  }

  return error ? (
    <p
      role="alert"
      className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
    >
      {error}
    </p>
  ) : (
    <p
      role="status"
      className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--success)]"
    >
      {notice}
    </p>
  );
}
