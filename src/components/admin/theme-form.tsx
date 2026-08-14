"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_WEBSITE_STATE,
  resolveWebsiteError,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import { saveThemeAction } from "@/app/[locale]/dashboard/website/actions";
import { FieldShell, FormResult, SelectField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import {
  ACCENT_INK,
  accentIsReadable,
  contrastRatio,
  safeColour,
  THEME_MODES,
  type ThemeSettings,
} from "@/lib/settings/theme-settings";

/**
 * Brand colours and the theme a first-time visitor gets.
 *
 * Two colours, not a palette: everything else in the token file is derived from
 * these, and a store owner has an opinion about their brand colour, not about
 * the shade a button turns while pressed.
 *
 * A native colour input alone cannot express "no override" — it always holds a
 * value — so each colour is a swatch beside a text field, and clearing the text
 * is how an owner returns to the built-in accent.
 *
 * The contrast reading updates as the colour does. The accent carries every
 * button label in the store, and a colour picked for how it looks as a
 * background is exactly the one that turns those labels unreadable; a warning at
 * the moment of choosing is worth more than a rule discovered later.
 */
export type ThemeFormProps = {
  theme: ThemeSettings;
  messages: AdminMessages["website"]["theme"];
  errors: AdminMessages["website"]["errors"];
};

function ColourField({
  name,
  label,
  hint,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  // The swatch needs a real colour; it falls back to a neutral when the text
  // field is empty or mid-typing.
  const swatch = safeColour(value) ?? "#888888";

  return (
    <FieldShell label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(event) => onChange(event.target.value)}
          aria-hidden="true"
          tabIndex={-1}
          className="size-11 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-1"
        />
        <input
          type="text"
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#06607b"
          maxLength={9}
          dir="ltr"
          spellCheck={false}
          className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 font-mono text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        />
      </div>
    </FieldShell>
  );
}

export function ThemeForm({ theme, messages, errors }: ThemeFormProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    saveThemeAction,
    INITIAL_WEBSITE_STATE,
  );
  const [accent, setAccent] = useState(theme.accent ?? "");
  const [accent2, setAccent2] = useState(theme.accent2 ?? "");

  const chosen = safeColour(accent);
  const ratio = chosen ? contrastRatio(chosen, ACCENT_INK) : null;
  const unreadable = chosen !== null && !accentIsReadable(chosen);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ColourField
          name="accent"
          label={messages.accentLabel}
          hint={messages.accentHint}
          value={accent}
          onChange={setAccent}
        />
        <ColourField
          name="accent_2"
          label={messages.accent2Label}
          hint={messages.accent2Hint}
          value={accent2}
          onChange={setAccent2}
        />
      </div>

      {ratio ? (
        <p
          className={
            unreadable
              ? "flex items-start gap-2 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-xs leading-5 text-[var(--ink-muted)]"
              : "text-xs leading-5 text-[var(--ink-faint)]"
          }
          role={unreadable ? "note" : undefined}
        >
          {unreadable ? <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" /> : null}
          <span>
            {messages.contrastLabel}: <span dir="ltr">{ratio.toFixed(2)}:1</span>
            {unreadable ? ` — ${messages.contrastWarning}` : ` — ${messages.contrastOk}`}
          </span>
        </p>
      ) : null}

      <SelectField
        label={messages.modeLabel}
        hint={messages.modeHint}
        name="default_mode"
        defaultValue={theme.defaultMode}
        fieldClassName="max-w-xs"
        options={THEME_MODES.map((mode) => ({ value: mode, label: messages.modes[mode] }))}
      />

      <FormResult
        error={resolveWebsiteError(errors, state.error)}
        notice={state.notice ? messages.saved : null}
      />

      <div>
        <Button type="submit" disabled={pending}>
          {messages.saveAction}
        </Button>
      </div>
    </form>
  );
}
