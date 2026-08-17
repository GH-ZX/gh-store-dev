# Site Name Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner set a localized site name (Arabic + English) in the dashboard Website settings, use it for the homepage tab always, and optionally spread it to the header/footer/invoice chrome.

**Architecture:** A new `branding` JSONB column on `store_settings`, normalized through `public-settings.ts` alongside the existing blocks. The dashboard writes it via a new `BrandingForm` + `saveBrandingAction`/`saveBranding`. `buildBrandName()` derives the per-locale display name once; chrome components receive it as a prop instead of importing `BRAND.name`.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres), Zod, Vitest, Playwright.

## Global Constraints

- Follow the settings-block pattern exactly: JSONB column, constraint `jsonb_typeof(branding) = 'object'`, normalize with fallback defaults, never break the storefront on a malformed row.
- `get_public_store_settings()` exposes the column (presentation-safe; contains no secrets).
- The dashboard saves only the `branding` column (`updateColumn`); never touch other columns.
- Every action result is a message key from `admin.json` errors; new copy goes in `admin.json` under `website.branding` (en + ar).
- Homepage tab uses `{ absolute: name }` so it never gets the `· GH Store` template suffix. Non-homepage metadata is unchanged.
- Empty configured name → fall back to `BRAND.name`/`APP_NAME` for that locale.
- Wordmark must not render an empty tail (single-word name).
- The homepage `<h1>` heading is unchanged (stays SEO title / messages fallback).
- `next typegen && tsc --noEmit` and `pnpm lint` must pass; Vitest suite must pass; admin E2E must pass.

---

### Task 1: Migration + settings normalizer

**Files:**
- Create: `supabase/migrations/20260817090000_store_branding_settings.sql`
- Modify: `supabase/migrations/20260812005000_store_settings_and_reviews.sql:5-30` (add `branding` to the settings read — see note)
- Modify: `src/lib/settings/public-settings.ts` (schema, types, `EMPTY_PUBLIC_SETTINGS`, `normalizePublicSettings`)
- Modify: `src/lib/brand.ts` (add `buildBrandName`)
- Test: create `src/lib/settings/public-settings.test.ts` if none exists, else append

**Interfaces:**
- Produces (later tasks rely on):
  - `PublicStoreSettings["branding"] = { nameAr: string; nameEn: string; useEverywhere: boolean }`
  - `normalizePublicSettings(value)` returns `branding` on the object.
  - `buildBrandName(settings: PublicStoreSettings, locale: Locale): string` — returns `nameAr`/`nameEn` when non-empty for the locale, else `BRAND.name`.
- Consumes: none.

- [ ] **Step 1: Write the failing tests**

In `src/lib/settings/public-settings.test.ts` (create the file):

```ts
import { describe, expect, it } from "vitest";
import { buildBrandName, normalizePublicSettings, EMPTY_PUBLIC_SETTINGS } from "@/lib/settings/public-settings";

describe("branding settings", () => {
  it("normalizes a valid branding object", () => {
    const s = normalizePublicSettings({ branding: { name_ar: "متجري", name_en: "My Store", use_everywhere: true } });
    expect(s.branding).toEqual({ nameAr: "متجري", nameEn: "My Store", useEverywhere: true });
  });
  it("defaults on a malformed or absent branding object", () => {
    const s = normalizePublicSettings({ branding: "broken" });
    expect(s.branding).toEqual({ nameAr: "", nameEn: "", useEverywhere: false });
    expect(EMPTY_PUBLIC_SETTINGS.branding).toEqual({ nameAr: "", nameEn: "", useEverywhere: false });
  });
  it("buildBrandName prefers the configured localized name", () => {
    const s = normalizePublicSettings({ branding: { name_ar: "متجري", name_en: "", use_everywhere: true } });
    expect(buildBrandName(s, "ar")).toBe("متجري");
    expect(buildBrandName(s, "en")).toBe("GH Store");
  });
});
```

Also add the schema tests entry for `branding` being object-typed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/settings/public-settings.test.ts`
Expected: FAIL (no `branding`, no `buildBrandName`)

- [ ] **Step 3: Migration**

Create `supabase/migrations/20260817090000_store_branding_settings.sql`:

```sql
alter table public.store_settings
  add column if not exists branding jsonb not null default '{}'::jsonb;

alter table public.store_settings
  add constraint store_settings_branding_is_object check (jsonb_typeof(branding) = 'object');

-- Expose to anonymous/authenticated visitors (presentation-safe).
create or replace function public.get_public_store_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'home_layout', coalesce(settings.home_layout, '[]'::jsonb),
    'social_links', coalesce(settings.social_links, '[]'::jsonb),
    'seo', coalesce(settings.seo, '{}'::jsonb),
    'contact', coalesce(settings.contact, '{}'::jsonb),
    'theme', coalesce(settings.theme, '{}'::jsonb),
    'branding', coalesce(settings.branding, '{}'::jsonb),
    'maintenance_mode', settings.maintenance_mode,
    'maintenance_message_ar', settings.maintenance_message_ar,
    'maintenance_message_en', settings.maintenance_message_en
  )
  from public.store_settings as settings
  where settings.id = 'global';
$$;

revoke all on function public.get_public_store_settings() from public;
grant execute on function public.get_public_store_settings() to anon, authenticated;
```

- [ ] **Step 4: Implement the normalizer**

In `public-settings.ts`:
- Add `branding: z.object({ name_ar: z.string().trim().max(80).optional(), name_en: z.string().trim().max(80).optional(), use_everywhere: z.boolean().optional() }).optional()` to `publicSettingsSchema`.
- Add `branding: { nameAr; nameEn; useEverywhere }` to `PublicStoreSettings` and to `EMPTY_PUBLIC_SETTINGS`.
- In `normalizePublicSettings`, map:
```ts
branding: {
  nameAr: settings.branding?.name_ar ?? "",
  nameEn: settings.branding?.name_en ?? "",
  useEverywhere: settings.branding?.use_everywhere ?? false,
},
```

In `src/lib/brand.ts`, add and export:

```ts
import type { Locale } from "@/i18n/config";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

/** The display name for a locale: the configured one when set, else the built-in brand. */
export function buildBrandName(settings: PublicStoreSettings, locale: Locale): string {
  const configured = locale === "ar" ? settings.branding.nameAr : settings.branding.nameEn;
  return configured.trim().length > 0 ? configured.trim() : BRAND.name;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/settings/public-settings.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add supabase/migrations/20260817090000_store_branding_settings.sql src/lib/settings/public-settings.ts src/lib/brand.ts src/lib/settings/public-settings.test.ts
git commit -m "feat: add configurable site name behind a branding settings block"
```

---

### Task 2: Dashboard service + action + form

**Files:**
- Modify: `src/lib/services/admin-website.service.ts` (add `branding` to `PRESENTATION_COLUMNS`, `PresentationRow`, `WebsiteSettings`; add `saveBranding`)
- Modify: `src/app/[locale]/dashboard/website/actions.ts` (add `saveBrandingAction`)
- Modify: `src/app/[locale]/dashboard/website/page.tsx` (render `BrandingForm` above the sections card)
- Create: `src/components/admin/branding-form.tsx`
- Modify: `src/i18n/messages/en/admin.json` + `src/i18n/messages/ar/admin.json` (`website.branding`)

**Interfaces:**
- Consumes: `getWebsiteSettings()` returns `branding`; `PublicStoreSettings["branding"]`.
- Produces: `saveBranding(input: BrandingInput): Promise<void>`; `saveBrandingAction` server action; `BrandingForm` component; message keys `website.branding.nameAr/nameEn/useEverywhere/useEverywhereHint/saveAction/saved`.

- [ ] **Step 1: Service**

In `admin-website.service.ts`:
- `PRESENTATION_COLUMNS = "home_layout, social_links, seo, contact, theme, branding"`
- Add `branding: Json;` to `PresentationRow`, and default `branding: data?.branding ?? {}` in `readPresentationRow`.
- Add to `WebsiteSettings` type: `branding: PublicStoreSettings["branding"];`
- In `getWebsiteSettings`, pass `branding: toJsonObject(row.branding)` into `normalizePublicSettings` and return `branding: settings.branding` on the result.
- Add type `export type BrandingInput = { nameAr: string; nameEn: string; useEverywhere: boolean };`
- Add writer:
```ts
export async function saveBranding(input: BrandingInput): Promise<void> {
  await requireAdmin();
  await updateColumn({
    branding: {
      name_ar: input.nameAr.trim(),
      name_en: input.nameEn.trim(),
      use_everywhere: input.useEverywhere,
    },
  });
}
```

- [ ] **Step 2: Action**

In `actions.ts`, import `saveBranding`, and add:

```ts
const brandingSchema = z.object({
  name_ar: z.string().trim().max(80).optional(),
  name_en: z.string().trim().max(80).optional(),
});

export async function saveBrandingAction(
  _state: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  const parsed = brandingSchema.safeParse({
    name_ar: formText(formData, "name_ar"),
    name_en: formText(formData, "name_en"),
  });

  if (!parsed.success) {
    return failure("invalid_input");
  }

  try {
    await saveBranding({
      nameAr: parsed.data.name_ar ?? "",
      nameEn: parsed.data.name_en ?? "",
      useEverywhere: formFlag(formData, "use_everywhere"),
    });
  } catch (error) {
    logFailure("admin.website", "branding_save_failed", error);
    return failure("unknown");
  }

  revalidatePath("/", "layout");
  return saved();
}
```

`failure`/`saved` already exist in actions.ts (lines 88-93); this action mirrors the SEO action (lines 410-450) exactly. Import `saveBranding` and `formFlag` (formFlag is already imported).

- [ ] **Step 3: Form component**

Create `src/components/admin/branding-form.tsx` modeled on `seo-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { INITIAL_WEBSITE_STATE, resolveWebsiteError, type WebsiteActionState } from "@/app/[locale]/dashboard/website/action-state";
import { saveBrandingAction } from "@/app/[locale]/dashboard/website/actions";
import { CheckboxField, FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

export type BrandingFormProps = {
  branding: PublicStoreSettings["branding"];
  messages: AdminMessages["website"]["branding"];
  errors: AdminMessages["website"]["errors"];
};

export function BrandingForm({ branding, messages, errors }: BrandingFormProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(saveBrandingAction, INITIAL_WEBSITE_STATE);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={messages.nameAr} name="name_ar" defaultValue={branding.nameAr} maxLength={80} />
        <TextField label={messages.nameEn} name="name_en" defaultValue={branding.nameEn} maxLength={80} dir="ltr" />
      </div>
      <CheckboxField label={messages.useEverywhere} hint={messages.useEverywhereHint} name="use_everywhere" defaultChecked={branding.useEverywhere} />
      <FormResult error={resolveWebsiteError(errors, state.error)} notice={state.notice ? messages.saved : null} />
      <div>
        <Button type="submit" disabled={pending}>{messages.saveAction}</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Wire the page**

In `page.tsx`, import `BrandingForm`, and above the sections `AdminCard` add:

```tsx
<AdminCard title={messages.branding.title} description={messages.branding.description}>
  <BrandingForm branding={settings.branding} messages={messages.branding} errors={messages.errors} />
</AdminCard>
```

- [ ] **Step 5: Copy**

`en/admin.json` under `website`:

```json
"branding": {
  "title": "Site name",
  "description": "Shown in the browser tab for the homepage. Turn the switch on to also use it in the header, footer, and invoices.",
  "nameAr": "Name in Arabic",
  "nameEn": "Name in English",
  "useEverywhere": "Use this name everywhere",
  "useEverywhereHint": "Also replaces the built-in name in the header, footer, and invoices.",
  "saveAction": "Save site name",
  "saved": "Site name saved."
}
```

Mirror in `ar/admin.json` (professional Arabic, e.g. nameAr "الاسم بالعربية", title "اسم المتجر", useEverywhere "استخدام هذا الاسم في كل مكان").

- [ ] **Step 6: Verify manually + commit**

Run `pnpm typecheck && pnpm lint`, then Start dev (`pnpm dev`), sign in as admin, open `/ar/dashboard/website` and confirm the new card renders and saves.
Commit:
```bash
git add src/lib/services/admin-website.service.ts "src/app/[locale]/dashboard/website/actions.ts" "src/app/[locale]/dashboard/website/page.tsx" src/components/admin/branding-form.tsx src/i18n/messages/en/admin.json src/i18n/messages/ar/admin.json
git commit -m "feat: dashboard site-name (branding) editor"
```

---

### Task 3: Storefront consumption (homepage tab + chrome props)

**Files:**
- Modify: `src/app/[locale]/page.tsx` (homepage `generateMetadata`)
- Modify: `src/app/[locale]/layout.tsx` (resolve name, pass props)
- Modify: `src/components/layout/site-header.tsx` (accept + render name/initials)
- Modify: `src/components/layout/site-footer.tsx` (accept name, use in brand + copyright)
- Modify: `src/components/layout/brand-wordmark.tsx` (split passed name)
- Modify: `src/app/[locale]/orders/[orderId]/invoice/page.tsx` (use resolved name)
- Test: `tests/e2e/admin.spec.ts` or new `tests/e2e/branding.spec.ts`

**Interfaces:**
- Consumes: `buildBrandName(settings, locale)`; `settings.branding.useEverywhere`.
- Produces: `SiteHeader`/`SiteFooter` prop `brandName: string`; `BrandWordmark` prop `name: string`.

- [ ] **Step 1: Homepage tab**

In `src/app/[locale]/page.tsx` `generateMetadata`, after computing settings and locale:

```ts
const name = buildBrandName(settings, locale);
// ...
return {
  ...buildPageMetadata({ locale, title: "", description, imageUrl: settings.seo.ogImageUrl }),
  title: { absolute: settings.branding.nameAr || settings.branding.nameEn || name },
};
```

Adjust so the tab is the configured name (ar preferred, then en, then built-in). Keep `description`/`og:image` from the existing SEO settings. Update the `buildPageMetadata` call accordingly (pass the real title or restructure to spread then override `title`).

- [ ] **Step 2: Locale layout passes the name**

In `src/app/[locale]/layout.tsx`, after `settings` resolves:

```tsx
const isLocalized = locale === "ar";
const brandName = settings.branding.useEverywhere
  ? buildBrandName(settings, locale)
  : BRAND.name;
```

Pass `brandName` to `<SiteHeader brandName={brandName} .../>` and `<SiteFooter brandName={brandName} .../>`.

- [ ] **Step 3: Header**

`site-header.tsx`: add `brandName: string` to props; use it for the `aria-label` (`brandName`); render duplicate-title initials in the logo tile. Compute initials: `brandName.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()`.

- [ ] **Step 4: Footer**

`site-footer.tsx`: add `brandName` prop; replace `BRAND.name` in the `aria-label`, the name span, and the copyright line.

- [ ] **Step 5: Wordmark**

`brand-wordmark.tsx`: accept `name: string` prop; replace `const [BRAND_MARK, ...BRAND_TAIL] = BRAND.name.split(" ");` with a split of the prop. Render the tail only when non-empty:

```tsx
{BRAND_TAIL_TEXT ? <span className={...}>{BRAND_TAIL_TEXT}</span> : null}
```

- [ ] **Step 6: Invoice**

`invoice/page.tsx`: read settings in the component (it already fetches), add `const brandName = buildBrandName(settings, locale)` (or reuse the header tagline logic) and render `{brandName}` instead of `APP_NAME`.

- [ ] **Step 7: E2E test**

Create `tests/e2e/branding.spec.ts` (use the existing `admin.setup.ts` storage state):
- Save `متجري`/`My Store` via the dashboard branding form.
- Assert homepage tab title shows the configured Arabic name (and NOT the SEO title).
- Turn on "use everywhere", assert the header/footer show the name.
- Reset the field to empty afterwards so other specs are unaffected.

Verify with `pnpm playwright test tests/e2e/branding.spec.ts`.
Run the full admin suite once: `pnpm test:e2e` (or the relevant projects; requires E2E creds in `.env.local`).

- [ ] **Step 8: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add "src/app/[locale]/page.tsx" "src/app/[locale]/layout.tsx" src/components/layout/site-header.tsx src/components/layout/site-footer.tsx src/components/layout/brand-wordmark.tsx "src/app/[locale]/orders/[orderId]/invoice/page.tsx" tests/e2e/branding.spec.ts
git commit -m "feat: site name drives the homepage tab and optional storefront chrome"
```

---

## Self-Review Notes

- Spec coverage: storage (Task 1), dashboard (Task 2), storefront (Task 3), edge cases (empty→fallback, single-word wordmark → Task 3 step 5, malformed → Task 1), testing (each task + E2E). ✓
- `buildBrandName` signature is consistent across tasks (settings + locale → string). ✓
- Task 2 action reuses the existing `failure()`/`saved()` helpers. ✓