# Connecting G2Bulk and Importing Games

This is the shortest path from a fresh store to a real catalog. It uses your own
G2Bulk account — GH Store never ships sample or placeholder products.

## 1. Create your account and become an administrator

1. Open `/ar/login?mode=sign-up` (or `/en/login?mode=sign-up`) and sign up with
   your email and a password of at least 8 characters.
2. If the store answers "we sent a confirmation email", open the link before
   continuing. Whether confirmation is required is a setting on the Supabase
   project, under **Authentication → Sign In / Providers → Email**.
3. Promote yourself to administrator. In the Supabase dashboard, open
   **SQL Editor** and run, with your own email:

   ```sql
   update public.profiles
      set role = 'admin'
    where email = 'you@example.com';
   ```

   The store reads authorization from `profiles.role`, and `public.is_admin()`
   also requires `is_active = true`, which is the default.
4. Open `/ar/dashboard`. A signed-out visitor is redirected to sign in; a
   signed-in non-admin is told they lack access rather than being bounced in a
   loop.

Only the first administrator needs this SQL step. Managing other staff from the
dashboard arrives with the customers section.

## 2. Save your G2Bulk API key

1. Get your key from the G2Bulk Telegram bot ([@G2BULKBOT](https://t.me/G2BULKBOT)).
   The account is wallet-funded; there is no web signup.
2. Go to **Dashboard → Providers and API**, paste the key into **API key**, set
   your **markup**, and save.
3. Press **Verify key**. A success shows your provider username and wallet
   balance, which confirms the key works and the store can reach the provider.

What happens to the key:

- It is stored in `store_settings.providers`, a column the public settings
  function never returns.
- It is never sent back to your browser. The form shows only a masked tail so
  you can tell two keys apart.
- Leaving the key field empty keeps the saved key, so you can change the markup
  without touching the secret.
- It is only ever sent to G2Bulk from the server, and only to the endpoints that
  require it.

If the provider rejects the key, the store stops and says so. It does **not**
retry: repeated 401s get your IP banned by G2Bulk.

## 3. Import games

1. Go to **Dashboard → Providers and API → Import games**.
2. Search and select the games you want. Games already connected to your store
   are marked *Imported*; selecting them again refreshes their prices.
3. Decide whether to **publish immediately**. Leave it on to see them in the
   store at once; turn it off to translate names and review prices first.
4. Import, then open the store to see them.

For each game the import creates or updates:

| What | Where it lands |
|------|----------------|
| The game | `games`, linked by provider code in `provider_game_mappings` |
| Each denomination | `offers` (`offer_type = 'topup'`), linked in `provider_offer_mappings` |
| Supplier cost | `provider_offer_mappings.supplier_cost_usd` |
| Account fields the supplier requires | `game_input_fields`, typed and labelled in both languages |
| Server list, when the game has one | options on the server field |
| A record of the run | `provider_sync_logs` |

## 4. What a re-import does and does not touch

Re-importing is safe and is how you refresh prices.

**Updated:** supplier cost, and the customer price *only* while an offer is on
default pricing and not on sale.

**Never overwritten:** names and descriptions you have translated or edited,
artwork, whether a game is published, sort order, sale prices, and any offer you
moved to custom or fixed pricing.

**Reconciled:** an offer the provider no longer lists is deactivated, not
deleted, because orders and invoices reference it. If it comes back, it is
reactivated. A game whose catalogue empties is unpublished.

## 5. Pricing

The customer price is the supplier cost plus your markup, rounded **up** to the
cent. Rounding down would shave margin on every order, and a fraction of a cent
is invisible to a customer. The price never falls below the supplier cost, even
at a zero markup.

Supplier cost is never shown to customers and is never sent back to G2Bulk as a
price.

Provider prices move with exchange rates, so the cost recorded at import time is
a snapshot. Re-import before a pricing review, and note that fulfilment re-reads
the live cost immediately before purchasing.
