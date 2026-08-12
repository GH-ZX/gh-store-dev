---
name: sam-api-wallet
---

# Sam API Wallet Rules

Read `references/api-docs.md` before implementing Sam API behavior. Manual ShamCash recharge remains supported; Sam API invoice mode is an additional path, not a replacement.

## Modes

| Mode | Customer flow | Admin flow |
|------|---------------|------------|
| Manual | QR/pay code, mark payment sent | Verify and approve |
| API | Sam invoice, payment URL, optional transaction reference | Monitor invoices and callbacks |

## Security

- `SAM_API_KEY` is server/Edge-only.
- Webhook URLs use a secret token and HTTPS.
- Match invoice ID, amount, currency, method, and pending status before crediting.
- Duplicate `invoice.paid` events must return success without double credit.
- Credit wallets through a protected RPC/transaction, never a browser update.
- Public payment config exposes flags only, never keys or tokens.
- Never confuse the legacy ShamCash helper with Sam API.

## GH-Store Boundaries

- Provider adapter: `src/providers/sam/`.
- Recharge and payment services: `src/lib/services/`.
- Webhooks: `src/app/api/webhooks/sam/` or Supabase Edge Functions.
- Contract: `docs/providers/` and `references/api-docs.md`.
