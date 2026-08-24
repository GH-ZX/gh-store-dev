-- Cached supplier wallet balances.
--
-- The overview reads these rows so the page paints instantly from the last
-- known truth, and each wallet carries its own sync button that re-asks its
-- supplier live. Suppliers answer at different speeds, which is why syncing is
-- per wallet rather than one bulk refresh: a slow BatStore must not hold a
-- fast G2Bulk hostage.
--
-- `wallet_key` is the stable identity of one balance source:
--   'g2bulk' | 'maxstore' | 'batstore' | 'sam:<method>:<identifier>'
-- Balances are stored as JSON because Sam reports several currencies on one
-- wallet, and a table per currency would be ceremony around an array.

create table if not exists public.provider_wallet_balances (
  id uuid primary key default gen_random_uuid(),

  -- Stable identity of one balance source.
  wallet_key text not null unique,
  provider text not null,
  label text,

  balances jsonb not null default '[]'::jsonb,

  status text not null default 'ok' check (status in ('ok', 'error')),
  error_kind text,

  synced_at timestamptz not null default timezone('utc', now())
);

alter table public.provider_wallet_balances enable row level security;

drop policy if exists provider_wallets_admin_all on public.provider_wallet_balances;
create policy provider_wallets_admin_all
on public.provider_wallet_balances
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
