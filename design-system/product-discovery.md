# Product discovery and catalog operations

This pass extends the active React Router storefront's
[restrained commerce design](storefront-redesign.md). The older Next.js glass
design contract does not describe the deployed app.

## Direction and reference

Keep the saved brand accent, white/light-gray customer surfaces, opaque dark
surfaces, current typography, 12px frames, clear prices, and 44px controls.
Product artwork and useful catalog navigation take priority over decoration.
Admin uses the concurrently shipped header, category navigation and drawer;
the overview follows those surfaces and adds operational readiness checks.

The Image Gen reference is
[/Users/mbalkhi/.codex/generated_images/01a07e34-dcdd-74c1-b0e0-476bf48c2a34/exec-30bd79f8-dc94-4e9c-8a5f-c28e5aff7bb8.png](/Users/mbalkhi/.codex/generated_images/01a07e34-dcdd-74c1-b0e0-476bf48c2a34/exec-30bd79f8-dc94-4e9c-8a5f-c28e5aff7bb8.png).
Its native size is 1434×1097. It establishes the campaign/discovery/featured
sequence; illustrative catalog entries and prices are never production data.

The original text-free hero asset now depicts a laptop, controller and digital
card, representing the wider catalog. Its production WebP is
`storefront/public/storefront/digital-essentials-v2.webp`. HTML renders all copy
and actions. The final asset moves the objects into the right side so copy
stays readable without a tinted overlay. Arabic mirrors this text-free art.

## Components and behavior

- **Opening:** retain the exact existing campaign/nav copy and destinations.
  Insert “Find your next digital essential” / “اكتشف ما تحتاجه لعالمك الرقمي”,
  its localized subtitle, real category names/counts, and All products.
- **Discovery:** show up to eight active categories with active products.
  Server-side relation counts avoid a truncated product-list count. Empty
  categories stay out; a failed supplementary query does not break home.
  The aggregate uses Supabase's documented
  [referenced-table count](https://supabase.com/docs/reference/javascript/select).
- **Catalog:** four/three/two-column product grids; larger square covers;
  category, product name, actual starting price and a clear product action.
  Offers distinguish their parent product, package, region/type and price.
  Logos and digital-card artwork retain their edges; game scenery may fill a
  cover. Failed images progress to an original/alternate source, then a named
  vector fallback without changing the frame size. Category palettes and
  isolated title direction keep missing artwork readable in square cards and
  in Arabic; repeated images have independent SVG paint definitions.
- **Details:** clear product/offer context, live filter results/reset, selected
  package, purchase summary, delivery information and bounded related products.
  A product with no offers gives useful catalog/contact alternatives. Related
  reads are supplemental and cannot take down the main detail page.
- **Admin:** operational queues appear before financial summaries; unavailable
  data is distinct from zero work. Catalog readiness links directly to products
  missing offers, categories or artwork. Price margin follows the draft price
  and compares compatible currencies only.

## Fidelity decisions

| Comparison | Implementation decision |
| --- | --- |
| Copy and navigation | Existing campaign/header text retained. Only the specified discovery title, subtitle, real categories/counts and All products are added. |
| Layout | Campaign → category discovery → configured carousel → configured sections; admin combines the shared navigation with queues, catalog readiness and financial reporting. |
| Palette and typography | Saved teal/blue accent and current Latin/Arabic fonts remain; white surfaces and gray canvas match the active design. |
| Artwork | Text-free still life replaces the gaming-only banner; final composition shrinks/moves the art to prevent overlap with copy. |
| Catalog content | Live category names and counts replace illustrative Programs/AI labels; no invented publisher, rating, discount or price is copied. |
| Featured products | Existing configurable carousel remains functional instead of replacing it with the static concept's tiles. Admin autoplay is now honored. |
| Product rails | Larger cards use explicit optional previous/next controls as well as native scrolling and View all. This helps mouse users reach clipped items. |
| Responsive layout | Desktop reference checked at 1434×1097; fixed 390px mobile views verify RTL, image framing, wrapping and overflow. |

Browser/IAB is used for manual navigation and interaction review. Playwright
provides repeatable viewport dimensions, file screenshots and isolated admin
component scenarios where no authenticated test account is available. Image
inspection compares the concept with the implementation; functional checks
separately exercise real navigation and mocked admin states. No production
catalog content, supplier rate, wallet or payment is changed during QA.

Release validation: 1,129 unit tests and 104 browser checks pass; two browser
cases are skipped where their controls do not apply to the device. English
and Arabic storefront navigation, themes, artwork and product selection are
covered. Isolated admin fixtures verify price drafts, refresh/error states,
daily figures and the integrated header/drawer at 360–430px without live writes.
