-- Migration 20261011120000: Email preferences and transactional email log
-- Adds customer email preferences to profiles and creates an idempotent email_log table.

alter table public.profiles
  add column if not exists email_notifications boolean not null default true;

comment on column public.profiles.email_notifications is
  'Customer preference for receiving transactional email updates.';

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  kind text not null,
  ref_id text,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists email_log_dedup_idx
  on public.email_log (user_id, kind, ref_id)
  where ref_id is not null;

create index if not exists email_log_user_idx on public.email_log (user_id, created_at desc);

alter table public.email_log enable row level security;
alter table public.email_log force row level security;

drop policy if exists "Admins read email logs" on public.email_log;
create policy "Admins read email logs"
  on public.email_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );
