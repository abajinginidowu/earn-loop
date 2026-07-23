-- =============================================================================
-- EarnLoop — Admin user management: a status column + secure admin functions.
-- Run AFTER schema.sql, in Supabase → SQL Editor. Re-runnable.
--
-- Why functions: a user's status / deletion must never be client-settable
-- (status isn't in the client-writable column grant, and deleting an account
-- needs auth.users access). These SECURITY DEFINER functions require an admin
-- caller and do the privileged work server-side.
-- =============================================================================

-- Account status shown/managed in the admin Users table.
alter table public.profiles
  add column if not exists status text not null default 'active'
  check (status in ('active', 'suspended', 'banned'));

-- Set a user's status (active | suspended | banned). Admin-only.
create or replace function public.admin_set_user_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'Invalid status: %', p_status;
  end if;
  update public.profiles set status = p_status where id = p_user_id;
end;
$$;

-- Delete a user entirely. Removing the auth.users row cascades to their profile
-- and everything they own (submissions, campaigns, transactions, …). Admin-only,
-- and admins cannot delete themselves.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Enforcement helpers.
--
-- Supabase mints the JWT before any of our code runs, so we can't refuse the
-- token itself. Enforcement is therefore in two halves: the browser signs a
-- blocked user straight back out (js/supabase.js → requireAuth), and every
-- action that moves points or money calls assert_active() below — the half that
-- matters, since the browser can be bypassed but the database can't.
--
-- account_status() is exposed to the frontend so the sign-in guard can ask
-- "am I still allowed in?" without reading the whole profile row.
-- ----------------------------------------------------------------------------
create or replace function public.account_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status from public.profiles where id = auth.uid()), 'active');
$$;

create or replace function public.assert_active()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text := public.account_status();
begin
  if v_status = 'banned' then
    raise exception 'This account has been banned.';
  elsif v_status = 'suspended' then
    raise exception 'This account is suspended.';
  end if;
end;
$$;

grant execute on function public.account_status() to authenticated;
grant execute on function public.assert_active() to authenticated;

-- Block earning at the source: a suspended/banned user can't file new task
-- proof. This is RLS, so it holds no matter which client inserts the row.
-- Same policy as schema.sql plus the status check — so if you ever re-run
-- schema.sql on its own, re-run this file after it to restore the guard.
drop policy if exists "submissions: insert own" on public.task_submissions;
create policy "submissions: insert own" on public.task_submissions
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'
    and coalesce((select status from public.profiles where id = auth.uid()), 'active') = 'active'
  );

-- =============================================================================
-- Done. The admin Users table can now list every profile and suspend/ban/
-- reactivate/delete accounts through these functions — and suspended/banned
-- accounts are locked out of submitting proof, spending, and ad rewards
-- (assert_active is called by create_campaign / create_video_ad / record_ad_view).
-- =============================================================================
