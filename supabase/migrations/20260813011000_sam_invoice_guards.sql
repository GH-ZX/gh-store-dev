-- Two things the first Sam migration left out.
--
-- 1. Sam invoices live 15 minutes and report their own deadline. Without storing
--    it the payment screen cannot count down, and an invoice that died quietly
--    looks identical to one still waiting for a transfer.
--
-- 2. A wallet transaction reference must not be usable twice. Sam matches a
--    reference against the receiving wallet's history, and nothing at the
--    provider stops the same transfer from matching two invoices — so if it ever
--    does, the second must fail here rather than credit again.

alter table public.sam_invoices
  add column if not exists expires_at timestamptz;

create unique index if not exists sam_invoices_transaction_ref_key
  on public.sam_invoices (transaction_ref)
  where transaction_ref is not null;

comment on index public.sam_invoices_transaction_ref_key is
  'One wallet transaction settles at most one invoice.';
