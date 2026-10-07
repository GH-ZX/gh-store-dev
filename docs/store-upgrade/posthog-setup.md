# Turning on PostHog (owner setup)

This is the step-by-step for item 20. The integration is **already built and
deployed**; it is inactive only because no project key is stored. Nothing needs a
code change or a redeploy — you fill in two fields in your own dashboard.

## What you get

- **Anonymous, consent-based event counts.** Only after a visitor opts in through
  the footer's *Analytics preferences*, and only if they have not sent
  Do-Not-Track or Global Privacy Control.
- **7 event names**, all prefixed `store_` before they are sent:

  | Event | Fires when |
  |---|---|
  | `store_catalog_view` | a category / catalog list page is viewed |
  | `store_product_view` | a product or offer detail page is viewed |
  | `store_checkout_view` | the checkout page loads |
  | `store_quick_buy` | the quick-buy panel is opened on the homepage |
  | `store_search` | a catalog search is run |
  | `store_search_empty` | a search returned nothing — **your best "what should I stock?" signal** |
  | `store_recharge_view` | the top-up page is viewed |

- **The funnel to watch:** `store_catalog_view` → `store_product_view` or
  `store_quick_buy` → `store_checkout_view`. Right now you have 36 signups, 13
  orders and 6 completions, and no idea where the other 23 people stopped. This
  is what tells you.

## What is never sent

No email, no user ID, no search text, no URL, no account-form contents, no wallet
address, no payment evidence, no delivered codes, and no session recording or
autocapture. The payload is an event name plus a random per-tab session id. There
is no cross-session retention and no revenue attribution — **your paid-order and
profit reports in the dashboard remain the revenue authority.** Event counts can
include bots and repeat views; they are not unique-customer counts.

## Steps

1. **Create the project.** Sign up at [posthog.com](https://posthog.com) and
   create a project for GH Store. If your traffic is mostly Syria / MENA / EU,
   choose the **EU** region when the project is created — the region cannot be
   changed later without a new project and a new key.
2. **Copy the Project API key.** In PostHog go to
   **Settings → Project → Project API key**. It starts with `phc_`.
   - Do **not** copy the Personal API key (starts with `phx_`). The store
     deliberately rejects a `phx_` key — it cannot post events.
3. **Note your Project ID.** PostHog → **Settings → Project → Project ID**. It is
   numeric and is used only to build the deep link to the analytics dashboard.
   You can leave it blank; the save still works.
4. **Enter them in the store.** Dashboard → **Website → Experience settings**
   (the section with the PostHog heading, `/#posthog-settings`):
   - Project API key: paste the `phc_…` value.
   - Project region: **EU** or **US** — must match the region you created.
   - Project ID: optional, from step 3.
   - **Tick "Enable PostHog"** — analytics stay off without it.
   - Save. The page confirms and notes that changes appear within 30 seconds.
5. **Verify the flag actually saved.** The public gate is a database function
   callable without signing in — this is the authoritative check, and it works
   from a terminal:
   ```powershell
   $u = "https://njlzgfddfnnqujaodbta.supabase.co"   # your Supabase project URL
   $k = "<your publishable key>"                     # the anon/publishable key
   $h = @{ apikey = $k; Authorization = "Bearer $k"; "Content-Type" = "application/json" }
   Invoke-RestMethod -Uri "$u/rest/v1/rpc/store_posthog_enabled" -Headers $h -Method Post -Body "null"
   ```
   It returns `False` today and must return `True` after you save with *Enable
   PostHog* ticked. If it stays `False`, your save did not persist — check that
   the project key matches `phc_…` and retry.
   Note the consent control in the footer only appears once this flag is `True`,
   so after enabling, reload and confirm the *Analytics preferences* control is
   present for a signed-out visitor. The
   `data-posthog-enabled="true"` attribute that
   `store-measurement.tsx` writes is set by client JavaScript **after
   hydration** — it never appears in the server HTML, so do not try to see it
   with a plain `Invoke-WebRequest` or `curl`; check it in the browser's
   Elements panel or skip it and rely on step 6, which is the real test.
6. **Verify an event really arrives (recommended).** In a private window: accept
   Analytics preferences in the footer, browse a category, open a product, and
   open checkout. Within a minute you should see `store_catalog_view`,
   `store_product_view` and `store_checkout_view` in PostHog → **Activity →
   Live events**. If you see nothing, check, in this order:
   - the **Enable PostHog** checkbox actually saved (reload the dashboard),
   - the key starts with `phc_` and matches the project's region,
   - you accepted the footer consent in *that* browser profile,
   - DNT/GPC is off in that browser.
7. **Look at one number weekly:** checkout completion, meaning
   `store_checkout_view` → paid orders. Improve the weakest real step before
   buying any traffic.

## Two honest limitations

- **PostHog is a convenience, not the source of truth.** The store keeps its own
  anonymous daily event totals in the dashboard with no third-party dependency,
  and it fails closed: if the database setting cannot be read, forwarding is
  disabled rather than guessed.
- **Consent costs you coverage.** Only opted-in visitors are counted, so absolute
  numbers understate real traffic. Read it as a *ratio* tool — how the funnel
  leaks — not as a visitor count.

## Why the key is safe here

`store_posthog_settings` has row-level security on; the table is revoked from
`anon` and readable/updatable only by an authenticated admin. Only the
`enabled` boolean crosses to the public side, through the
`store_posthog_enabled()` function. Never put the key in source code, and treat
the personal API key as a credential you never paste into the store at all.
