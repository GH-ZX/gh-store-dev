-- Supabase's default privileges on `public` hand EXECUTE to `anon` the moment a
-- function is created, so the previous migration's `revoke all ... from public`
-- left the anonymous role holding a grant it should never have had. The guard
-- inside both functions already refuses a caller without an admin profile, but
-- an admin-only function should not be reachable by a signed-out visitor at all
-- -- `admin_adjust_wallet` is not, and these should match it.

revoke execute on function public.admin_overview_snapshot(integer) from anon;
revoke execute on function public.admin_daily_sales_series(integer) from anon;
