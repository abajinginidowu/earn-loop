-- =============================================================================
-- EarnLoop — Referral loop: stable codes, signup capture, and the payout.
-- Run AFTER schema.sql, tasks-and-rewards.sql and video-ads.sql (which defines
-- the setting_int() helper used below), in Supabase → SQL Editor. Re-runnable.
--
-- The loop, end to end:
--   invite   → the referrer shares profiles.referral_code (generated below)
--   register → the browser stores ?ref=CODE and calls claim_referral() once the
--              new account has a session → a 'pending' referrals row
--   earn     → when the friend's Nth task is APPROVED, a trigger pays the
--              referrer referral_reward points and flips the row to 'rewarded'
--
-- The payout is a trigger rather than client code, so it fires no matter how a
-- submission gets approved (admin UI, SQL, a future auto-validator) and can
-- never be triggered by the browser.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles.referral_code — the shareable code, generated once per account.
--    Format: HANDLE-ABCD (handle + 4 chars of the user id) so it stays readable
--    and is unique even when two people pick similar usernames.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists referral_code text;

create or replace function public.make_referral_code(p_id uuid, p_handle text)
returns text
language sql
immutable
as $$
  select coalesce(
           nullif(trim(both '-' from left(regexp_replace(upper(coalesce(nullif(trim(p_handle), ''), 'USER')),
                                                         '[^A-Z0-9]+', '-', 'g'), 16)), ''),
           'USER')
         || '-' || upper(left(replace(p_id::text, '-', ''), 4));
$$;

-- Backfill everyone who signed up before this file existed.
update public.profiles
  set referral_code = public.make_referral_code(id, coalesce(nullif(username, ''), full_name))
  where referral_code is null;

create unique index if not exists profiles_referral_code_idx on public.profiles(referral_code);

-- Stamp the code on every new profile row (the signup trigger inserts it).
create or replace function public.set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.make_referral_code(new.id, coalesce(nullif(new.username, ''), new.full_name));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_referral_code on public.profiles;
create trigger profiles_referral_code before insert on public.profiles
  for each row execute function public.set_referral_code();

-- The code is public by design (it's meant to be shared), but the profiles table
-- isn't — so claiming happens through the function below, not a direct select.

-- ----------------------------------------------------------------------------
-- 2. claim_referral(code) — called by the browser right after a new account gets
--    its first session. Refuses self-referral, double-claims, and claims from
--    accounts that aren't new, so an old account can't be "re-referred".
--    Returns { claimed, reason }.
-- ----------------------------------------------------------------------------
create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_me       public.profiles;
  v_referrer public.profiles;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_code), '') = '' then
    return jsonb_build_object('claimed', false, 'reason', 'no_code');
  end if;

  select * into v_me from public.profiles where id = v_uid;
  if v_me.id is null then
    return jsonb_build_object('claimed', false, 'reason', 'no_profile');
  end if;

  -- Only brand-new accounts can be attributed to a referrer.
  if v_me.created_at < now() - interval '7 days' then
    return jsonb_build_object('claimed', false, 'reason', 'account_too_old');
  end if;

  if exists (select 1 from public.referrals where referred_id = v_uid) then
    return jsonb_build_object('claimed', false, 'reason', 'already_referred');
  end if;

  select * into v_referrer from public.profiles
    where upper(referral_code) = upper(trim(p_code));
  if v_referrer.id is null then
    return jsonb_build_object('claimed', false, 'reason', 'unknown_code');
  end if;
  if v_referrer.id = v_uid then
    return jsonb_build_object('claimed', false, 'reason', 'self_referral');
  end if;

  insert into public.referrals (referrer_id, referred_id, referred_name, code, status, reward_points)
  values (
    v_referrer.id, v_uid,
    coalesce(nullif(v_me.full_name, ''), v_me.username, 'Friend'),
    upper(trim(p_code)), 'pending', 0
  );

  insert into public.notifications (user_id, type, title, message, icon)
  values (
    v_referrer.id, 'info', 'New Referral',
    coalesce(nullif(v_me.full_name, ''), v_me.username, 'Someone') ||
      ' joined with your link. You earn points once they complete their first task.',
    'user-plus'
  );

  return jsonb_build_object('claimed', true, 'reason', 'ok');
end;
$$;

grant execute on function public.claim_referral(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. The payout. When a submission flips to 'approved', check whether the
--    submitter was referred and has now completed enough tasks; if so, pay the
--    referrer the current referral_reward (admin-editable) exactly once.
--    referral_required_tasks defaults to 1 and is admin-editable too.
-- ----------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('referral_required_tasks', '1'::jsonb)
on conflict (key) do nothing;

create or replace function public.reward_referral_if_ready(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref      public.referrals;
  v_required int := public.setting_int('referral_required_tasks', 1);
  v_reward   int := public.setting_int('referral_reward', 20);
  v_done     int;
  v_name     text;
begin
  select * into v_ref from public.referrals
    where referred_id = p_user and status <> 'rewarded'
    limit 1;
  if v_ref.id is null then return; end if;

  select count(*) into v_done from public.task_submissions
    where user_id = p_user and status = 'approved';
  if v_done < greatest(v_required, 1) then return; end if;

  update public.referrals
    set status = 'rewarded', reward_points = v_reward
    where id = v_ref.id;

  update public.profiles set points = points + v_reward where id = v_ref.referrer_id;

  select coalesce(nullif(full_name, ''), username, 'Your friend') into v_name
    from public.profiles where id = p_user;

  insert into public.point_transactions (user_id, type, label, points, cash)
    values (v_ref.referrer_id, 'referral', 'Referral bonus: ' || coalesce(v_name, 'friend'), v_reward, 0);

  insert into public.notifications (user_id, type, title, message, icon)
    values (v_ref.referrer_id, 'success', 'Referral Reward',
            coalesce(v_name, 'Your friend') || ' completed their first task. +' || v_reward || ' points added.',
            'gift');
end;
$$;

create or replace function public.on_submission_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') <> 'approved' then
    perform public.reward_referral_if_ready(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists task_submissions_approved on public.task_submissions;
create trigger task_submissions_approved after update on public.task_submissions
  for each row execute function public.on_submission_approved();

-- =============================================================================
-- Done. Share links now carry a real code (?ref=…), new signups are attributed
-- through claim_referral(), and the referrer is paid automatically the moment
-- their friend's first task is approved.
-- =============================================================================
