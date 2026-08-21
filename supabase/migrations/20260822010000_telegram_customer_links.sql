-- Customer Telegram links.
--
-- The bot now serves customers, not just the owner. A customer links their
-- Telegram chat to their store account, and the bot answers with their orders
-- and wallet balance.
--
-- Linking proof is a short-lived code shown on the site's profile page, where
-- only the signed-in account owner can see it. The bot receives the code,
-- verifies it, and writes the chat -> user link. No password or email is ever
-- handled by the bot.

-- One chat maps to one store account, and one account to one chat.
create table if not exists public.telegram_chat_links (
  chat_id bigint primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  username text,
  first_name text,
  linked_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists telegram_chat_links_user_idx
  on public.telegram_chat_links (user_id);

-- Codes minted on the profile page. One-use, short-lived.
create table if not exists public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  chat_id bigint,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists telegram_link_codes_user_idx
  on public.telegram_link_codes (user_id, created_at desc);

alter table public.telegram_chat_links enable row level security;
alter table public.telegram_link_codes enable row level security;

-- A customer sees and can unlink their own chat link. The bot writes rows with
-- the service key.
drop policy if exists telegram_chat_links_select_own on public.telegram_chat_links;
create policy telegram_chat_links_select_own
on public.telegram_chat_links
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists telegram_chat_links_delete_own on public.telegram_chat_links;
create policy telegram_chat_links_delete_own
on public.telegram_chat_links
for delete
to authenticated
using (user_id = auth.uid());

-- A customer can mint and read their own codes; only the bot consumes them.
drop policy if exists telegram_link_codes_select_own on public.telegram_link_codes;
create policy telegram_link_codes_select_own
on public.telegram_link_codes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists telegram_link_codes_insert_own on public.telegram_link_codes;
create policy telegram_link_codes_insert_own
on public.telegram_link_codes
for insert
to authenticated
with check (user_id = auth.uid());

grant select, delete on public.telegram_chat_links to authenticated;
grant select, insert on public.telegram_link_codes to authenticated;
