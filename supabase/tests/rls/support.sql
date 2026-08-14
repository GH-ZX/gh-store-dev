begin;

select plan(8);

select has_column(
  'public',
  'support_threads',
  'message_count',
  'Threads carry their own message count, so the queue is one query'
);

select has_function(
  'public',
  'support_touch_thread',
  'Thread activity is maintained by the database, not by whichever caller remembers'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.support_threads'::regclass),
  'Support threads enforce row-level security'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.support_messages'::regclass),
  'Support messages enforce row-level security'
);

select ok(
  (
    select count(*) = 3
      and count(*) filter (where policyname = 'support_threads_select_own') = 1
      and count(*) filter (where policyname = 'support_threads_insert_own') = 1
      and count(*) filter (where policyname = 'support_threads_admin_all') = 1
    from pg_policies
    where schemaname = 'public' and tablename = 'support_threads'
  ),
  'Thread policies are explicit and limited'
);

/*
 * The absence of a customer update policy is itself the guard, so it is asserted
 * rather than assumed: with one, a customer could resolve their own thread and
 * drop it out of the owner's queue.
 */
select ok(
  (
    select count(*) = 0
    from pg_policies
    where schemaname = 'public'
      and tablename = 'support_threads'
      and cmd = 'UPDATE'
      and policyname <> 'support_threads_admin_all'
  ),
  'Only an admin may update a thread directly'
);

select ok(
  (
    select count(*) = 3
      and count(*) filter (where policyname = 'support_messages_select_own') = 1
      and count(*) filter (where policyname = 'support_messages_insert_own') = 1
      and count(*) filter (where policyname = 'support_messages_admin_all') = 1
    from pg_policies
    where schemaname = 'public' and tablename = 'support_messages'
  ),
  'Message policies are explicit and limited'
);

/*
 * One review per order. Without it the order page could stack two testimonials
 * against one purchase.
 */
select ok(
  (
    select count(*) = 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'reviews'
      and indexname = 'reviews_one_per_order_idx'
  ),
  'An order can only be reviewed once'
);

select * from finish();

rollback;
