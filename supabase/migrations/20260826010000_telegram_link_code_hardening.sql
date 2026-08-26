-- Harden Telegram link codes.
--
-- Linking proof was a six-character code minted from a predictable generator,
-- consumed by the bot with a read-then-write that put no limit on wrong guesses.
-- Anyone who could message the bot could guess codes forever, and one lucky
-- guess did not stop at reading a wallet balance in chat: the bot hands a linked
-- chat magic sign-in links. That is account takeover at ten-to-the-sixth odds.
--
-- Three changes, all enforced here rather than in callers:
--
--   * Guessing is budgeted per chat — five failures per ten-minute window,
--     tracked against the Telegram chat id, which is the one thing every guess
--     has in common. The counter lives in the database because the bot's isolate
--     memory resets and multiplies.
--   * Consumption is atomic. The code row is locked before anything reads it, so
--     two messages racing the same code cannot both pass the used-check and bind
--     two chats to one account.
--   * Codes are matched case-insensitively, because customers type what they
--     see; the site mints uppercase either way.
--
-- Code generation itself moves to the platform CSPRNG on the site side; this
-- migration only carries the parts the bot cannot be trusted to do alone.

-- One budget row per Telegram chat. No policies and no grants: RLS is enabled,
-- and only the service role — which bypasses RLS — touches it, through the
-- function below.
create table if not exists public.telegram_link_attempts (
  chat_id bigint primary key,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.telegram_link_attempts enable row level security;

create or replace function public.consume_telegram_link_code(
  p_chat_id bigint,
  p_code text,
  p_username text default null,
  p_first_name text default null,
  p_language_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_budget constant integer := 5;
  v_window constant interval := interval '10 minutes';
  v_now timestamptz := timezone('utc', now());
  v_attempt public.telegram_link_attempts;
  v_row public.telegram_link_codes;
begin
  v_code := upper(btrim(coalesce(p_code, '')));

  /*
   * The budget is checked and spent under a row lock, so fifty guesses landing
   * in the same instant see one counter, not fifty copies of it.
   */
  select a.* into v_attempt
  from public.telegram_link_attempts a
  where a.chat_id = p_chat_id
  for update;

  if v_attempt.chat_id is null or v_attempt.window_started_at < v_now - v_window then
    insert into public.telegram_link_attempts (chat_id, failed_count, window_started_at, updated_at)
    values (p_chat_id, 0, v_now, v_now)
    on conflict (chat_id) do update
      set failed_count = 0,
          window_started_at = excluded.window_started_at,
          updated_at = excluded.updated_at
    returning * into v_attempt;
  end if;

  if v_attempt.failed_count >= v_budget then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select c.* into v_row
  from public.telegram_link_codes c
  where c.code = v_code
  for update;

  if v_row.id is null then
    update public.telegram_link_attempts
    set failed_count = failed_count + 1, updated_at = v_now
    where chat_id = p_chat_id;

    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_row.used_at is not null then
    update public.telegram_link_attempts
    set failed_count = failed_count + 1, updated_at = v_now
    where chat_id = p_chat_id;

    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  if v_row.expires_at is not null and v_row.expires_at < v_now then
    update public.telegram_link_attempts
    set failed_count = failed_count + 1, updated_at = v_now
    where chat_id = p_chat_id;

    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Spent correctly: the budget row goes, so linking again later starts clean.
  delete from public.telegram_link_attempts where chat_id = p_chat_id;

  -- One account has one chat. Drop any older link before binding the new one —
  -- the user_id unique index would otherwise reject the upsert.
  delete from public.telegram_chat_links
  where user_id = v_row.user_id
    and chat_id <> p_chat_id;

  insert into public.telegram_chat_links (chat_id, user_id, username, first_name, language_code)
  values (p_chat_id, v_row.user_id, p_username, p_first_name, p_language_code)
  on conflict (chat_id) do update
    set user_id = excluded.user_id,
        username = excluded.username,
        first_name = excluded.first_name,
        language_code = excluded.language_code,
        linked_at = timezone('utc', now());

  update public.telegram_link_codes
  set used_at = v_now, chat_id = p_chat_id
  where id = v_row.id;

  return jsonb_build_object('ok', true, 'user_id', v_row.user_id);
end;
$$;

revoke all on function public.consume_telegram_link_code(bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_telegram_link_code(bigint, text, text, text, text)
  to service_role;

comment on function public.consume_telegram_link_code(bigint, text, text, text, text) is
  'Service-role only. Consumes a Telegram link code atomically, with a per-chat
   guessing budget. Replaces the read-then-write the bot used to do itself.';
