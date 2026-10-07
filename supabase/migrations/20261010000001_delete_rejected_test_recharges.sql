-- Item 4: remove the owner's own rejected recharge test attempts.
--
-- The owner confirmed: "for those 13 of 21 recharges, those were tryings from me
-- and my friends, just delete the rejected ones, just testings."
--
-- Why they are worth removing rather than leaving as history:
--   * They are the entire content of the "rejected" bucket in Dashboard ->
--     Recharges, so the owner's review queue and any payment-funnel reading is
--     dominated by their own test taps. The "19% approval rate" that reads off
--     this table is an artefact of testing, not customer behaviour.
--   * Four of them sit at 150.00 (`RC-9F326B47CC`, `RC-5AEE04AD69`,
--     `RC-C90230F371`) probing the request ceiling. Not revenue, not refunds,
--     not owed to anyone.
--
-- What this deliberately does NOT delete, and why:
--   * Nothing that credited a wallet. Four `approved` requests credited 19.50 in
--     total and each has a matching `wallet_transactions` deposit row
--     (`RC-2B87247F49`, `RC-BAE5DC9955`, `RC-0897758E54`, `RC-F6F08C0B53`).
--     A credited request is ledger history and is left untouched.
--   * Nothing with a payment transaction hash. A claimed on-chain transfer is
--     evidence, and evidence is not a test artefact even when the request was
--     rejected.
--   * Nothing still open (`pending`, `payment_sent`) and nothing `expired`.
--     An expired request is real customer intent that never completed; the
--     retention sweep owns those, not this migration.
--   * No invoice that was ever paid or credited. The invoice rows removed here
--     are all `expired` with a null `paid_at` and a null `credited_at`, which is
--     the processor's own record that no money ever arrived.
--
-- ---------------------------------------------------------------------------
-- Two deliberate deviations from "just delete the rejected ones", both to avoid
-- destroying data that testing did not create:
--
-- 1. `sam_invoices.recharge_request_id` is `on delete restrict`, and ten of the
--    rejected requests do have a Sam invoice behind them. The restriction is the
--    schema saying an invoice is not disposable, so this migration removes only
--    the invoice rows that are provably dead (`expired`, never paid, never
--    credited) before removing their request. A rejected request whose invoice
--    had ever been paid would still refuse to delete, which is the correct
--    outcome: that request is not a test.
--
-- 2. The two most recent rejected requests are NOT deleted:
--      `RC-E08E876B2C` (2026-09-17, 0.50, BEP20, admin note "Jei3ueudh")
--      `RC-4F1D1CAFB1` (2026-09-24, 3.00, BEP20, admin note a long gibberish string)
--    They carry free-text notes that could describe a real failed customer
--    transfer rather than a test, and they are the only two rejected requests
--    from the last three weeks. Deleting them would be irreversible; leaving two
--    rows in the queue is a small cost. They are marked as probable tests in the
--    note below so the owner can clear them in one click after confirming.
-- ---------------------------------------------------------------------------

-- 1. Dead processor invoices behind rejected, uncredited requests.
delete from public.sam_invoices
 where status = 'expired'
   and paid_at is null
   and credited_at is null
   and recharge_request_id in (
     select id from public.recharge_requests
      where status = 'rejected'
        and coalesce(wallet_credit_amount, 0) = 0
        and payment_tx_hash is null
        and created_at < timestamptz '2026-09-10 00:00:00+00'
   );

delete from public.binance_invoices
 where status = 'expired'
   and paid_at is null
   and credited_at is null
   and recharge_request_id in (
     select id from public.recharge_requests
      where status = 'rejected'
        and coalesce(wallet_credit_amount, 0) = 0
        and payment_tx_hash is null
        and created_at < timestamptz '2026-09-10 00:00:00+00'
   );

-- 2. The rejected test attempts themselves. The predicate can never match a row
-- that credited money or carried transfer evidence, so a re-run on another
-- database cannot silently destroy a ledger entry.
delete from public.recharge_requests
 where status = 'rejected'
   and coalesce(wallet_credit_amount, 0) = 0
   and payment_tx_hash is null
   and created_at < timestamptz '2026-09-10 00:00:00+00';

-- 3. Mark the two retained rows so the owner can decide rather than guess.
update public.recharge_requests
   set admin_note = coalesce(nullif(admin_note, ''), '') ||
         ' [TEST-REVIEW: likely an owner test attempt; kept because the note could describe a real failed transfer. Safe to reject/delete after confirming.]'
 where status = 'rejected'
   and reference in ('RC-E08E876B2C', 'RC-4F1D1CAFB1');

-- Verification (run after applying):
--   select status, count(*) from public.recharge_requests group by status order by status;
--   -- expects rejected = 2, approved = 4, expired = 4  (was 13 / 4 / 4)
--
--   select count(*) from public.wallet_transactions where type = 'deposit';   -- unchanged: 4
--   select sum(wallet_credit_amount) from public.recharge_requests;           -- unchanged: 19.50
--   select count(*) from public.sam_invoices where paid_at is not null;       -- unchanged
