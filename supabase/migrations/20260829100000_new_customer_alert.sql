-- New-customer admin alert.
-- Every new profile with role = customer enqueues an owner alert so the
-- Telegram control centre sees sign-ups in real time. The alert carries a
-- deep-link payload so the worker can render a button to the customer's
-- dashboard page.

create or replace function public.notify_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'customer' then
    insert into public.telegram_alerts (type, payload)
    values (
      'new_customer',
      jsonb_build_object(
        'user_id', new.id,
        'email', coalesce(new.email, ''),
        'full_name', coalesce(new.full_name, ''),
        'username', coalesce(new.username, '')
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_customer on public.profiles;

create trigger trg_notify_new_customer
  after insert on public.profiles
  for each row execute function public.notify_new_customer();

revoke all on function public.notify_new_customer() from public, anon, authenticated;
