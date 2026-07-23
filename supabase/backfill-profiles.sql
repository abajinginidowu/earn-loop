-- =============================================================================
-- EarnLoop — Backfill missing profiles (SAFE version).
-- Run once in Supabase → SQL Editor (safe to re-run).
--
-- Creates a profiles row for any auth user that doesn't have one (e.g. the first
-- admin, created before the signup trigger existed). Only id/email/full_name are
-- set — username is left NULL to avoid the unique-username clash that made the
-- earlier version fail; set your display name/username later in Account Settings.
-- =============================================================================

insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Check: should return 0 rows once everyone has a profile.
select u.id, u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
