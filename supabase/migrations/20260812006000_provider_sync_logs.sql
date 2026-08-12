-- Audit trail for provider catalogue syncs and imports.
--
-- Every import records what was requested, what changed, and what failed, so an
-- unexpected price or a missing game can be traced to the run that produced it.
-- Admin-only: the log names provider identifiers and supplier costs.
create table if not exists public.provider_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  kind text not null check (kind in ('catalog_import', 'catalog_sync', 'wallet_check', 'reconciliation')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  requested_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  started_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists provider_sync_logs_provider_started_idx
  on public.provider_sync_logs (provider_name, started_at desc);
create index if not exists provider_sync_logs_status_idx
  on public.provider_sync_logs (status, started_at desc);

drop trigger if exists provider_sync_logs_set_updated_at on public.provider_sync_logs;
create trigger provider_sync_logs_set_updated_at
before update on public.provider_sync_logs
for each row
execute function public.set_updated_at();

alter table public.provider_sync_logs enable row level security;

drop policy if exists provider_sync_logs_admin_all on public.provider_sync_logs;
create policy provider_sync_logs_admin_all
on public.provider_sync_logs
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.provider_sync_logs to authenticated;
