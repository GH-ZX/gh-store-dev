-- Make the support tables usable.
--
-- `support_threads` and `support_messages` have existed since the orders and
-- operations migration, with their policies already correct: a customer reads
-- and writes only their own thread, `sender_role` is pinned to 'customer' on
-- insert so a customer cannot post a message that renders as the store's answer,
-- and there is deliberately no customer update policy, so nobody can resolve
-- their own ticket out of the owner's queue.
--
-- What was never finished is the activity bookkeeping. `last_message_at` is
-- declared and never written by anything, and there is no message count, so a
-- queue ordered by "most recently active" cannot be built and a thread list
-- costs one extra query per row. Nothing has used these tables until now, so
-- this has never shown.

-- Counting messages per thread on read is a query per row in the queue. echocore
-- reads exactly this pair — a count and a last-activity time — to render its
-- thread list.
alter table public.support_threads
  add column if not exists message_count integer not null default 0;

/*
 * Maintain the activity columns in the database rather than in whichever caller
 * remembers.
 *
 * `security definer` because it has to update a row the replying customer's own
 * policy will not let them touch: they may add a message, they may not decide
 * their thread is resolved. That asymmetry is the point — it is what stops a
 * customer clearing their own ticket, while still letting their reply reopen it.
 */
create or replace function public.support_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set message_count = (
        select count(*) from public.support_messages where thread_id = new.thread_id
      ),
      last_message_at = new.created_at,
      status = case
        -- A closed thread stays closed; reopening is a deliberate act.
        when status = 'closed' then status
        when new.sender_role = 'admin' then 'pending'
        when new.sender_role = 'customer' then 'open'
        else status
      end
  where id = new.thread_id;

  return new;
end;
$$;

revoke all on function public.support_touch_thread() from public;

drop trigger if exists support_messages_touch_thread on public.support_messages;
create trigger support_messages_touch_thread
after insert on public.support_messages
for each row
execute function public.support_touch_thread();

/*
 * The existing index is `(user_id, status, updated_at desc)`, which serves a
 * customer reading their own threads. The owner's queue asks the other question
 * — every thread at a given status, most recently active first — and would fall
 * back to a scan.
 */
create index if not exists support_threads_queue_idx
  on public.support_threads (status, coalesce(last_message_at, created_at) desc);

-- Backfill, so threads created before the trigger existed still sort and count
-- correctly rather than sitting at zero for ever.
update public.support_threads t
set message_count = counted.total,
    last_message_at = counted.latest
from (
  select thread_id, count(*) as total, max(created_at) as latest
  from public.support_messages
  group by thread_id
) as counted
where counted.thread_id = t.id
  and (t.message_count is distinct from counted.total
       or t.last_message_at is distinct from counted.latest);
