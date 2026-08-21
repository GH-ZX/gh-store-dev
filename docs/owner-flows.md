# GH Store — How It Works

A plain-language guide to every flow that exists today, what each one guarantees,
and where to go in the dashboard. Written for the store owner, not for a
developer.

This document describes the implemented customer and owner flows. The final
release items are production configuration, visible catalog/content review, safe
UAT, and operational readiness—not missing dashboard pages.

---

## 1. Getting in

| Page | Who |
|------|-----|
| `/ar/login` | anyone — sign in or create an account |
| `/ar/login?mode=sign-up` | create an account |
| `/ar/forgot-password` | request a password reset link |
| `/ar/dashboard` | administrators only |

Signing in lands you on your account page. If you were sent to sign in from a
page that required it, you return to that page instead.

**Administrator access** comes from `profiles.role = 'admin'`. The first
administrator is set with one SQL statement — see
[connecting-g2bulk.md](operations/connecting-g2bulk.md). A signed-in customer who
opens a dashboard URL is told they do not have access; they never see your data.

**Password reset** needs one setting on your Supabase project: add your site URL
to **Authentication → URL Configuration → Redirect URLs**. Until then, reset
emails arrive but the link is refused.

---

## 2. Filling the catalog

Everything a customer can buy comes from your G2Bulk account. The store ships
with no sample products.

**Dashboard → الموردون والـ API (Providers and API)**

1. Paste your G2Bulk API key and set your markup, then save.
2. Press **Verify key** — it shows your supplier username and wallet balance,
   which proves the key works.
3. **Import games** for top-ups, or **Import cards and codes** for gift cards.
   Pick what you want; decide whether to publish immediately.

Your key is stored in the settings row that also holds payment configuration, and
that row is never readable by a visitor. After saving, the key is never shown
again — only the last four characters, so you can tell two keys apart. It is only
ever sent to G2Bulk from the server.

If G2Bulk rejects the key, the store stops and says so. It does **not** retry:
repeated rejections get your IP banned by G2Bulk.

### What a re-import does

Re-importing is how you refresh prices, and it is safe.

- **Updated:** supplier cost, and the customer price *only* while an offer is on
  automatic pricing and not on sale.
- **Never touched:** names and translations you edited, artwork, whether a game
  is published, sort order, sale prices, and any offer you moved to custom or
  fixed pricing.
- **Reconciled:** an item the supplier stopped listing is switched off, not
  deleted, because orders and invoices point at it. If it comes back, it is
  switched on again — but only if *the sync* switched it off. Anything **you**
  hid stays hidden.

### Pricing

Customer price = supplier cost + your markup, rounded **up** to the cent, and
never below cost. Supplier cost is never shown to customers.

Provider prices move with exchange rates, so the cost recorded at import time is
a snapshot. Fulfilment re-reads the live cost immediately before buying.

---

## 3. Editing the catalog

**Dashboard → الألعاب (Games)**

Search and filter your games, then open one to edit both languages' names, the
URL slug, the in-game currency name, descriptions, artwork, the carousel badge,
ordering, and whether it is published.

> Setting the **currency name** is worth doing first. Suppliers name packages with
> bare numbers — `60`, `18` — which mean nothing on a card. Set the currency name
> once and every package reads properly: `60 UC`.

Below that, each package shows its selling price, pre-discount price, pricing
mode, sale flag, and publish flag. **Supplier cost and your margin are shown but
cannot be typed over** — they are the provider's numbers.

**Pricing modes:** *automatic* follows your markup on every import. *Custom* and
*fixed* are yours and a sync never changes them. An offer on sale is also left
alone.

---

## 4. The storefront

**Dashboard → الموقع والواجهة (Website)** controls the homepage: which sections
appear, in what order, their titles in both languages, and how many items each
shows. Also social links, contact channels, and the homepage SEO text.

Sections resolve independently. A section with nothing to show is dropped rather
than rendered empty, and one that fails to load does not take the page down.

The hero carousel shows games you flag with **Show in the hero carousel** in the
game editor.

Arabic is the default language and renders right-to-left; English renders
left-to-right. Every page exists in both.

---

## 5. Wallet and balances

The store is wallet-based: a customer holds a balance and spends it. There is no
card payment at checkout.

**Every movement is recorded and nothing can be edited or deleted.** A customer
sees the full history on `/ar/wallet`.

### Adjusting a balance yourself

**Dashboard → الزبائن (Customers)** → pick the account → **تصحيح الرصيد**

A positive amount adds, a negative one deducts, and a reason is required. Every
change appears in the customer's own history as an *admin adjustment*, recording
who made it.

Two guarantees: submitting the form twice does **not** double-credit, and an
adjustment that would leave a negative balance is refused.

### How customers add balance

Two routes, and the difference between them is the whole point.

**Manual transfer — always waits for you.** You publish a payment method (a
ShamCash number, for example) on **Dashboard → طلبات التعبئة**, along with the
smallest and largest amount you accept. A customer submits a request, gets a
reference like `RC-1F4B82249B`, and sends the money. Nothing is credited until you
press approve. There is deliberately **no** setting to credit these
automatically: a customer typing "I sent it" is a claim, not evidence, so
switching that on would let anyone fund themselves for free.

**Sam API — credits itself, because the money can be proved.** Set this up on
**Dashboard → واجهات الـ APIs**. The customer presses تعبئة المحفظة, chooses an
amount, and transfers to *your* ShamCash or Syriatel wallet through Sam. The
server then asks Sam whether that transfer actually arrived, and only credits when
Sam confirms it — for at least the amount invoiced, in the currency it was billed
in. This is the one place in the store where money is credited without you.

If you would rather see every payment first, tick **راجع كل دفعة بنفسي قبل إضافة
الرصيد** in the Sam settings. A confirmed payment then lands in
**Dashboard → طلبات التعبئة** as *processing*, with the payment already evidenced,
and waits for your approval like a manual one.

#### Setting up Sam API

1. **Dashboard → واجهات الـ APIs** → the Sam API card.
2. Paste your Sam key and save. The key is stored on the server and never shown
   again — only its last four characters, so you can tell which key is saved.
3. Press **اعرض المحافظ**. This proves the key works and lists the wallets linked
   to your Sam account, with their balances.
4. Copy the identifier of the wallet that should receive customers' money into the
   matching field and save.
5. Choose whether customers are billed in dollars or Syrian pounds. Pounds need an
   exchange rate; their wallet is credited in dollars either way.

You never have to configure a callback URL anywhere: it is sent to Sam with each
invoice, carrying a secret this store generates and never displays.

#### What protects the money here

- The function that credits a Sam payment can only be called by the server. A
  signed-in customer calling it directly gets `permission denied`.
- The paid amount is compared against the amount billed. An underpayment is
  refused rather than credited in full.
- A payment is credited to the account recorded when the invoice was created,
  never to whoever the provider's message names.
- A repeated confirmation credits once. So does a repeated approval.
- One wallet transaction reference cannot settle two invoices.
- An invoice already closed as failed or expired is never flipped to paid.

---

## 6. Buying — what happens, in order

1. Customer opens a package and presses buy.
2. Checkout asks for exactly the account details the supplier requires for that
   game — player ID, and server or character name when the game needs them.
3. **The price is recalculated on the server.** The browser cannot influence the
   total.
4. The balance is checked and the money moved in a single database transaction.
   Either the order exists and is paid, or nothing happened at all.
5. Fulfilment starts.

### Guarantees worth knowing

- A customer can never spend another customer's balance.
- Two purchases at once cannot both pass a balance check only one can afford.
- A double-click cannot place two orders — the second attempt returns the first
  order.
- A failed purchase leaves no trace: no order, no charge.
- A customer cannot create an order or change their own balance directly, even
  with a crafted request. Both are blocked at the database.

---

## 7. Delivery, and what happens when it fails

Fulfilment runs on the server with its own authority, never as the customer — so
nobody can trigger their own refund.

For a **top-up**: the player ID is validated with G2Bulk *before* any of your
supplier balance is spent, the live cost is re-read, the order is placed, and then
its state is polled.

For a **gift card**: the code is bought and stored the moment it arrives. The
provider only keeps codes for 30 days, so the copy in your database is the one
that matters.

### The three outcomes

| Outcome | What the customer sees | What happens to the money |
|---|---|---|
| **Delivered** | order marked complete, with the code if there is one | charge stands |
| **Still processing** | order marked in progress | charge stands, nothing is refunded |
| **Failed** | order marked refunded, with the reason | **refunded automatically, exactly once** |

**"Still processing" is not failure.** A supplier can finish minutes later, so the
store waits rather than refunding — refunding something that then gets delivered
would lose the money outright.

A retry never buys twice: each purchase carries a key the provider honours for 30
minutes, and the store's own record of the attempt makes a repeat a no-op.

The reason a customer reads is the supplier's own wording. Internal
classification is kept separately, for you.

> **Your supplier balance must be funded.** If your G2Bulk wallet is empty,
> orders will be charged, fail, and refund — which works correctly, but sells
> nothing.

---

## 8. Customer accounts

`/ar/profile` — name, username, password, wallet summary, and a link to orders.
`/ar/wallet` — balance and full history.
`/ar/orders` — order history; each order shows what was bought, the details
submitted, the payment status, the delivery state, and any codes.

A suspended account (`profiles.is_active = false`) can sign in but sees only an
explanation, with nothing editable.

**On deleting an account:** wallet history cannot be erased — it is the proof of
your own transactions as much as the customer's. Closing an account means removing
personal details and keeping the financial record without identity. The privacy
page says exactly this.

---

## 9. Where to look when something goes wrong

| Question | Where |
|---|---|
| Did my import work? | Dashboard → Providers → **Recent syncs** |
| Why did this order fail? | Dashboard → Customers → the customer → their transactions; the order page shows the supplier's reason |
| Was this customer charged twice? | their wallet history — every movement is there, in order |
| Is my supplier balance low? | the balance pill in the header, or Providers → Verify key |
| Is the key still valid? | Providers → **Verify key** |

---

## 10. Release readiness checklist

The application and dashboard flows are implemented. Before opening the store to
customers, the owner must verify these production items:

- Production Auth URL, recovery URL, and OAuth redirect URL.
- Sam, G2Bulk, and Binance callback URLs and secrets.
- Cloudflare Worker secrets and five-minute reconciliation cron.
- Provider API keys, provider balances, and active provider mappings.
- Every published offer's name, translation, price, currency, image, delivery
  type, and required account fields.
- Contact channels, support expectations, privacy policy, terms, and refund copy.
- One small approved customer journey from recharge through delivery/refund.
- A rollback plan for a bad deployment, provider outage, or payment mismatch.

Keep uncertain products unpublished until their provider behavior and customer
instructions have been confirmed.

## 11. Two rules that keep the money honest

1. **Never edit `wallets`, `wallet_transactions`, or `orders` directly in the
   database.** Every balance change goes through a function that locks the row,
   refuses a negative balance, and writes the audit record. A direct edit breaks
   the agreement between the balance and its history.
2. **Never share the service-role key or the G2Bulk key.** The service key
   bypasses every protection described here. It belongs in server configuration
   only, and never in a browser, a screenshot, or a chat message.
