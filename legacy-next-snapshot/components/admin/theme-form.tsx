"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  INITIAL_WEBSITE_STATE,
  resolveWebsiteError,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import { saveThemeAction } from "@/app/[locale]/dashboard/website/actions";
import { FieldShell, FormResult, SelectField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { AlertIcon, ChevronIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import { matchThemePreset, THEME_PRESETS } from "@/lib/settings/theme-presets";
import {
  ACCENT_INK,
  accentIsReadable,
  BACKDROP_INTENSITIES,
  BACKDROPS,
  CORNER_STYLES,
  DARK_SHADES,
  DENSITIES,
  HEADING_FONTS,
  LIGHT_TINTS,
  MOTION_LEVELS,
  contrastRatio,
  darkAccentPaint,
  lightAccentPaint,
  safeColour,
  themeStyle,
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

/**
 * One expandable section of the editor.
 *
 * The theme panel now carries more dimensions than fit comfortably open at
 * once, so each concern folds away behind its own summary — the same pattern
 * the page-listings editor uses. `defaultOpen` marks the one a first visit
 * should meet expanded; everything else stays out of the way until asked for.
 */
function ThemeGroup({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-semibold text-[var(--ink)]">{title}</span>
        <ChevronIcon
          direction="down"
          className="size-4 shrink-0 text-[var(--ink-faint)] transition-transform duration-[var(--duration)] group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-4 border-t border-[var(--line)] p-4">{children}</div>
    </details>
  );
}

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

/*
 * The preview miniature.
 *
 * Every position and size below is an inline style on purpose: the card draws
 * the same picture for all seventeen presets, so its geometry is static and
 * only its colours move — and the colours are values like `color-mix(...)`
 * that Tailwind classes cannot carry. It is decorative throughout; the button's
 * text label is the accessible name.
 */

const PREVIEW_DARK_CANVAS = "#050b14";
const PREVIEW_LIGHT_CANVAS = "#f4f7fb";

function PreviewHalf({
  side,
  canvas,
  accent,
  ink,
  accent2,
}: {
  side: "start" | "end";
  canvas: string;
  accent: string;
  ink: string;
  accent2: string;
}) {
  const line = side === "start" ? "rgba(255,255,255,0.28)" : "rgba(13,28,46,0.22)";

  return (
    <span
      className="absolute inset-y-0 w-1/2 overflow-hidden"
      style={{
        [side === "start" ? "left" : "right"]: 0,
        background: canvas,
      }}
    >
      {/* Ambient glow, drawn from the accent exactly as the storefront's mesh is. */}
      <span
        className="absolute"
        style={{
          top: -14,
          [side === "start" ? "left" : "right"]: -10,
          width: 56,
          height: 40,
          background: `radial-gradient(closest-side, ${accent} 0%, transparent 72%)`,
          opacity: 0.45,
        }}
      />
      {/* Header: logo dot + a nav line. */}
      <span
        className="absolute rounded-full"
        style={{ top: 6, left: 8, width: 5, height: 5, background: accent }}
      />
      <span
        className="absolute rounded-full"
        style={{ top: 7.5, left: 17, width: 18, height: 3, background: line }}
      />
      {/* Primary button carrying its real label ink, at miniature scale. */}
      <span
        className="absolute flex items-center justify-center rounded-[4px]"
        style={{ bottom: 16, left: 8, width: 38, height: 15, background: accent }}
      >
        <span
          className="rounded-full"
          style={{ width: 22, height: 3, background: ink }}
        />
      </span>
      {/* Secondary chip outlined in the second accent. */}
      <span
        className="absolute rounded-[4px] border"
        style={{
          bottom: 16,
          left: 50,
          width: 26,
          height: 15,
          borderColor: accent2,
          background: `color-mix(in srgb, ${accent2} 20%, transparent)`,
        }}
      />
      {/* Body text line. */}
      <span
        className="absolute rounded-full"
        style={{ bottom: 6, left: 8, width: 44, height: 3, background: line }}
      />
    </span>
  );
}

/** A split dark/light miniature of the storefront, painted with the preset. */
function PresetPreview({ accent, accent2 }: { accent: string; accent2: string }) {
  const dark = darkAccentPaint(accent);
  const light = lightAccentPaint(accent);

  return (
    <span
      aria-hidden="true"
      className="relative block h-16 w-full overflow-hidden rounded-md border border-black/25"
    >
      <PreviewHalf side="start" canvas={PREVIEW_DARK_CANVAS} accent={dark.accent} ink={dark.ink} accent2={accent2} />
      <PreviewHalf side="end" canvas={PREVIEW_LIGHT_CANVAS} accent={light.accent} ink={light.ink} accent2={accent2} />
    </span>
  );
}

export function ThemeForm({ theme, messages, errors }: ThemeFormProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    saveThemeAction,
    INITIAL_WEBSITE_STATE,
  );
  const [accent, setAccent] = useState(theme.accent ?? "");
  const [accent2, setAccent2] = useState(theme.accent2 ?? "");
  /** Every dimension, as currently chosen — the source the live preview paints. */
  const [draft, setDraft] = useState<ThemeSettings>(theme);

  const chosen = safeColour(accent);
  const ratio = chosen ? contrastRatio(chosen, ACCENT_INK) : null;
  const unreadable = chosen !== null && !accentIsReadable(chosen);
  const active = matchThemePreset({ ...draft, accent: chosen, accent2: safeColour(accent2) });

  function setDimension<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /*
   * The live preview.
   *
   * The exact same builder that writes the storefront's theme stylesheet runs
   * here against the draft, and its output is injected as a `<style>` tag:
   * identical rules, so what the admin sees while choosing is pixel-for-pixel
   * what visitors get after saving. The tag empties once saved, handing
   * ownership back to the server-rendered sheet, and removes itself when the
   * form unmounts.
   */
  const previewAccent = safeColour(accent);
  const previewAccent2 = safeColour(accent2);
  const previewTheme: ThemeSettings = { ...draft, accent: previewAccent, accent2: previewAccent2 };

  useEffect(() => {
    const tag = document.createElement("style");

    tag.setAttribute("data-theme-preview", "");
    document.head.append(tag);

    return () => {
      tag.remove();
    };
  }, []);

  useEffect(() => {
    const tag = document.querySelector<HTMLStyleElement>("style[data-theme-preview]");

    if (!tag) {
      return;
    }

    // A successful save revalidates the tree, so the server sheet is current;
    // clearing the preview hands over without a flash of stale overrides.
    tag.textContent = state.notice === "saved" ? "" : themeStyle(previewTheme);
  });

  return (
    <form action={formAction} className="grid gap-4">
      <ThemeGroup title={messages.groups.presets} defaultOpen>
        <fieldset className="grid gap-1.5">
          <legend className="text-xs font-medium text-[var(--ink-soft)]">{messages.presetsLabel}</legend>
        {/*
         * Cards, not pills: each preset is shown as the storefront itself in
         * miniature — dark half and light half, header, button, label ink —
         * because "how would this look?" is answered by looking, not by
         * imagining two dots against a name.
         */}
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {THEME_PRESETS.map((preset) => {
            const selected = active?.id === preset.id;

            return (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAccent(preset.accent);
                    setAccent2(preset.accent2);
                  }}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-[var(--radius-card)] border p-2 text-start transition-colors duration-[var(--duration)]",
                    selected
                      ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[var(--surface-strong)]"
                      : "border-[var(--line)] hover:border-[var(--line-strong)]",
                  )}
                >
                  <PresetPreview accent={preset.accent} accent2={preset.accent2} />
                  <span className="flex items-center gap-2 px-0.5">
                    <span
                      className="size-4 shrink-0 rounded-full border border-black/25"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${preset.accent} 0 50%, ${preset.accent2} 50% 100%)`,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "truncate text-xs font-medium",
                        selected ? "text-[var(--ink)]" : "text-[var(--ink-soft)]",
                      )}
                    >
                      {messages.presets[preset.id as keyof typeof messages.presets]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.presetsHint}</span>
        </fieldset>

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
      </ThemeGroup>

      <ThemeGroup title={messages.groups.canvas}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={messages.modeLabel}
            hint={messages.modeHint}
            name="default_mode"
            value={draft.defaultMode}
            onChange={(event) => setDimension("defaultMode", event.target.value as ThemeSettings["defaultMode"])}
            options={THEME_MODES.map((mode) => ({ value: mode, label: messages.modes[mode] }))}
          />

          <SelectField
            label={messages.backdropLabel}
            hint={messages.backdropHint}
            name="backdrop"
            value={draft.backdrop}
            onChange={(event) => setDimension("backdrop", event.target.value as ThemeSettings["backdrop"])}
            options={BACKDROPS.map((backdrop) => ({
              value: backdrop,
              label: messages.backdrops[backdrop],
            }))}
          />

          <SelectField
            label={messages.darkShadeLabel}
            name="dark_shade"
            value={draft.darkShade}
            onChange={(event) => setDimension("darkShade", event.target.value as ThemeSettings["darkShade"])}
            options={DARK_SHADES.map((value) => ({ value, label: messages.darkShades[value] }))}
          />
          <SelectField
            label={messages.lightTintLabel}
            name="light_tint"
            value={draft.lightTint}
            onChange={(event) => setDimension("lightTint", event.target.value as ThemeSettings["lightTint"])}
            options={LIGHT_TINTS.map((value) => ({ value, label: messages.lightTints[value] }))}
          />
          <SelectField
            label={messages.intensityLabel}
            hint={messages.intensityHint}
            name="backdrop_intensity"
            value={draft.backdropIntensity}
            onChange={(event) =>
              setDimension("backdropIntensity", event.target.value as ThemeSettings["backdropIntensity"])
            }
            options={BACKDROP_INTENSITIES.map((value) => ({ value, label: messages.intensities[value] }))}
          />
        </div>
      </ThemeGroup>

      <ThemeGroup title={messages.groups.shape}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={messages.cornerLabel}
            name="corner_style"
            value={draft.cornerStyle}
            onChange={(event) => setDimension("cornerStyle", event.target.value as ThemeSettings["cornerStyle"])}
            options={CORNER_STYLES.map((value) => ({ value, label: messages.corners[value] }))}
          />
          <SelectField
            label={messages.densityLabel}
            name="density"
            value={draft.density}
            onChange={(event) => setDimension("density", event.target.value as ThemeSettings["density"])}
            options={DENSITIES.map((value) => ({ value, label: messages.densities[value] }))}
          />
        </div>
      </ThemeGroup>

      <ThemeGroup title={messages.groups.type}>
        <SelectField
          label={messages.headingFontLabel}
          hint={messages.headingFontHint}
          name="heading_font"
          value={draft.headingFont}
          onChange={(event) => setDimension("headingFont", event.target.value as ThemeSettings["headingFont"])}
          options={HEADING_FONTS.map((value) => ({ value, label: messages.headingFonts[value] }))}
        />
      </ThemeGroup>

      <ThemeGroup title={messages.groups.motion}>
        <SelectField
          label={messages.motionLabel}
          hint={messages.motionHint}
          name="motion_level"
          value={draft.motionLevel}
          onChange={(event) => setDimension("motionLevel", event.target.value as ThemeSettings["motionLevel"])}
          options={MOTION_LEVELS.map((value) => ({ value, label: messages.motionLevels[value] }))}
        />
      </ThemeGroup>

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
