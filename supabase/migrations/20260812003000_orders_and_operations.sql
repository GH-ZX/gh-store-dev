create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'GS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  user_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'payment_pending', 'paid', 'processing', 'fulfilling', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  payment_method text,
  payment_attempt_id uuid references public.payment_attempts (id) on delete set null,
  wallet_transaction_id uuid references public.wallet_transactions (id) on delete set null,
  currency text not null default 'USD' check (currency in ('USD', 'SYP', 'EUR')),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  customer_note text,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  name_ar_snapshot text not null,
  name_en_snapshot text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  dynamic_fields jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.idempotency_keys (
  key uuid primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  operation text not null,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, operation, key)
);

create table if not exists public.fulfillment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  provider text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'refunded', 'reconcile')),
  attempt_number integer not null default 1 check (attempt_number > 0),
  external_order_id text,
  idempotency_key uuid,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  delivered_payload jsonb,
  error_code text,
  error_message text,
  last_checked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, idempotency_key),
  unique (provider, external_order_id)
);

create table if not exists public.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  fulfillment_attempt_id uuid references public.fulfillment_attempts (id) on delete set null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default timezone('utc', now()),
  unique (provider, external_event_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default (
    'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  user_id uuid not null references public.profiles (id) on delete restrict,
  entity_type text not null check (entity_type in ('order', 'recharge')),
  entity_id uuid not null,
  status text not null default 'issued'
    check (status in ('issued', 'paid', 'cancelled', 'refunded')),
  currency text not null default 'USD' check (currency in ('USD', 'SYP', 'EUR')),
  document_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (entity_type, entity_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type text not null,
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  href text,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  is_visible boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'admin', 'system')),
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);
create index if not exists order_items_order_idx
  on public.order_items (order_id);
create index if not exists fulfillment_attempts_item_status_idx
  on public.fulfillment_attempts (order_item_id, status, created_at desc);
create index if not exists fulfillment_events_attempt_idx
  on public.fulfillment_events (fulfillment_attempt_id, received_at desc);
create index if not exists invoices_user_created_idx
  on public.invoices (user_id, created_at desc);
create index if not exists notifications_user_visible_idx
  on public.notifications (user_id, is_visible, created_at desc);
create index if not exists support_threads_user_status_idx
  on public.support_threads (user_id, status, updated_at desc);
create index if not exists support_messages_thread_created_idx
  on public.support_messages (thread_id, created_at);
create index if not exists audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists fulfillment_attempts_set_updated_at on public.fulfillment_attempts;
create trigger fulfillment_attempts_set_updated_at
before update on public.fulfillment_attempts
for each row
execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

drop trigger if exists support_threads_set_updated_at on public.support_threads;
create trigger support_threads_set_updated_at
before update on public.support_threads
for each row
execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.fulfillment_attempts enable row level security;
alter table public.fulfillment_events enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own
on public.orders
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all
on public.orders
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own
on public.order_items
for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

drop policy if exists order_items_select_admin on public.order_items;
create policy order_items_select_admin
on public.order_items
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists fulfillment_attempts_select_admin on public.fulfillment_attempts;
create policy fulfillment_attempts_select_admin
on public.fulfillment_attempts
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists fulfillment_events_select_admin on public.fulfillment_events;
create policy fulfillment_events_select_admin
on public.fulfillment_events
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own
on public.invoices
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists invoices_select_admin on public.invoices;
create policy invoices_select_admin
on public.invoices
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all
on public.notifications
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists support_threads_select_own on public.support_threads;
create policy support_threads_select_own
on public.support_threads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists support_threads_insert_own on public.support_threads;
create policy support_threads_insert_own
on public.support_threads
for insert
to authenticated
with check (user_id = auth.uid() and status = 'open');

drop policy if exists support_threads_admin_all on public.support_threads;
create policy support_threads_admin_all
on public.support_threads
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists support_messages_select_own on public.support_messages;
create policy support_messages_select_own
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1 from public.support_threads
    where support_threads.id = support_messages.thread_id
      and support_threads.user_id = auth.uid()
  )
);

drop policy if exists support_messages_insert_own on public.support_messages;
create policy support_messages_insert_own
on public.support_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and sender_role = 'customer'
  and exists (
    select 1 from public.support_threads
    where support_threads.id = support_messages.thread_id
      and support_threads.user_id = auth.uid()
  )
);

drop policy if exists support_messages_admin_all on public.support_messages;
create policy support_messages_admin_all
on public.support_messages
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select
on public.audit_logs
for select
to authenticated
using (public.is_admin(auth.uid()));

grant select on public.orders, public.order_items, public.invoices,
  public.notifications, public.support_threads, public.support_messages to authenticated;
grant insert on public.support_threads, public.support_messages to authenticated;
grant update on public.notifications to authenticated;
grant select on public.fulfillment_attempts, public.fulfillment_events,
  public.audit_logs to authenticated;
