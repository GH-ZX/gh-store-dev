begin;

select plan(5);

select has_table(
  'public',
  'profiles',
  'GH Store identity table exists'
);

select has_column(
  'public',
  'profiles',
  'role',
  'GH Store profile roles exist'
);

select has_function(
  'public',
  'is_admin',
  array['uuid'::text],
  'GH Store admin helper exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ),
  'Profiles enforce row-level security'
);

select ok(
  (
    select count(*) = 4
      and count(*) filter (where policyname = 'profiles_select_admin') = 1
      and count(*) filter (where policyname = 'profiles_select_own') = 1
      and count(*) filter (where policyname = 'profiles_update_admin') = 1
      and count(*) filter (where policyname = 'profiles_update_own') = 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  ),
  'Profile policies are explicit and limited'
);

select * from finish();

rollback;
