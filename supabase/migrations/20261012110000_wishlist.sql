-- 20261012110000_wishlist.sql
-- User wishlist / favorites storage with owner-only RLS.

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint uq_wishlist_user_product unique (user_id, product_id)
);

create index if not exists idx_wishlist_items_user_id on public.wishlist_items(user_id);
create index if not exists idx_wishlist_items_product_id on public.wishlist_items(product_id);

alter table public.wishlist_items enable row level security;

drop policy if exists wishlist_items_owner_select on public.wishlist_items;
create policy wishlist_items_owner_select on public.wishlist_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists wishlist_items_owner_insert on public.wishlist_items;
create policy wishlist_items_owner_insert on public.wishlist_items
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists wishlist_items_owner_delete on public.wishlist_items;
create policy wishlist_items_owner_delete on public.wishlist_items
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, delete on public.wishlist_items to authenticated;
