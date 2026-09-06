# GH Store
- Localized digital-goods storefront: customer catalog/auth/wallet/checkout/orders/support/invoices; owner dashboard for catalog/providers/payments/fulfillment/customers/audit.
- Production: `https://gh-store.me`; production config lives outside git.
- Source map: Next app/routes `src/app`; UI `src/components`; domain/integration code `src/lib`; provider adapters `src/providers`; generated DB types `src/types/database.ts`; Cloudflare entry `worker.ts`; Supabase migrations/functions under `supabase`; tests under `tests`.
- Deployment topology and Cloudflare invariants: `mem:cloudflare/core`.
- Supabase schema/function/release invariants: `mem:supabase/core`.
- Stack and pinned versions: `mem:tech_stack`. Commands: `mem:suggested_commands`. Code conventions: `mem:conventions`. Completion checks: `mem:task_completion`.
- Never commit `.env.local`, `.dev.vars`, provider/payment credentials, webhook secrets, or customer data.