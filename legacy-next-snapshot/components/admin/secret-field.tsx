"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CloseIcon, PencilIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * A secret input that locks itself once a value is saved.
 *
 * The saved secret never travels back to the browser, so a locked field has
 * nothing to show. It is disabled — and therefore not submitted — which is
 * what keeps the stored value alive while the owner saves the rest of the
 * form. The only way in is the Edit button, pressed on purpose, and Cancel
 * closes it again. An unlocked field that is left empty also keeps the saved
 * value, which matches the server-side merge of every provider's settings.
 */
export type SecretFieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  /** Shown while locked, in place of the field's own help. */
  lockedHint?: string;
  /** The field's regular help text. */
  hint?: string;
  /** The "leave empty to keep the saved value" note, shown while editing. */
  keepHint?: string;
  editLabel: string;
  cancelLabel: string;
  /** Whether a secret is already stored; true locks the field until edited. */
  configured: boolean;
  className?: string;
};

export function SecretField({
  label,
  name,
  placeholder,
  lockedHint,
  hint,
  keepHint,
  editLabel,
  cancelLabel,
  configured,
  className,
}: SecretFieldProps) {
  const [editing, setEditing] = useState(false);
  const locked = configured && !editing;

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--ink-soft)]">{label}</span>

      <span className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          name={name}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          disabled={locked}
          readOnly={locked}
          placeholder={locked ? "••••••••••••" : placeholder}
          aria-label={label}
          className={cn(
            "min-h-12 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 font-mono text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
        />

        {configured ? (
          <Button
            type="button"
            variant={editing ? "ghost" : "secondary"}
            size="sm"
            onClick={() => setEditing((value) => !value)}
            leadingIcon={editing ? <CloseIcon /> : <PencilIcon />}
          >
            {editing ? cancelLabel : editLabel}
          </Button>
        ) : null}
      </span>

      <span className="text-xs leading-5 text-[var(--ink-faint)]">
        {locked && lockedHint ? lockedHint : `${hint ?? ""}${editing && keepHint ? ` ${keepHint}` : ""}`}
      </span>
    </label>
  );
}