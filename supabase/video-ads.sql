-- =============================================================================
-- EarnLoop — Video ads: real storage, server-derived pricing, and a secure
-- "watch = points" reward. Run AFTER schema.sql and users-admin.sql (which
-- defines assert_active), in Supabase → SQL Editor. Re-runnable.
--
-- WHY functions again: the ad overlay pays users for watching. If the client
-- could write points, anyone could loop the reward. So the browser only says
-- "I finished ad X" and the server decides whether that earns anything —
-- checking the ad is live, that the user isn't the advertiser, and that enough
-- time has passed since their last paid view (derived from the admin's
-- ad_frequency_minutes setting, so tightening the setting tightens the loop).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns the frontend needs that schema.sql didn't have yet.
-- ----------------------------------------------------------------------------
alter table public.video_ads add column if not exists link_url text;

-- ----------------------------------------------------------------------------
-- 2. setting_int(key, fallback) — read an admin-configurable number out of the
--    settings table. Used everywhere below so admin edits take effect live.
-- ----------------------------------------------------------------------------
create or replace function public.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key), p_default);
$$;

grant execute on function public.setting_int(text, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. ad_views — one row per PAID view. Doubles as the anti-farming record
--    (the cooldown below reads it) and as the advertiser's delivery proof.
-- ----------------------------------------------------------------------------
create table if not exists public.ad_views (
  id             uuid primary key default gen_random_uuid(),
  ad_id          uuid not null references public.video_ads(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  points_awarded int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ad_views_user_idx on public.ad_views(user_id, created_at desc);
create index if not exists ad_views_ad_idx   on public.ad_views(ad_id);

alter table public.ad_views enable row level security;
drop policy if exists "ad_views: read own or admin" on public.ad_views;
-- Read-only to clients (like the point ledger); rows are written by the
-- SECURITY DEFINER function below, never by the browser.
create policy "ad_views: read own or admin" on public.ad_views
  for select using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. Storage bucket for the uploaded ad videos.
--    Public-read (the overlay plays them for every user); writes are confined to
--    the uploader's own folder: ad-videos/<user_id>/<file>.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ad-videos', 'ad-videos', true)
on conflict (id) do nothing;

drop policy if exists "ad-videos: upload own"       on storage.objects;
drop policy if exists "ad-videos: read all"         on storage.objects;
drop policy if exists "ad-videos: delete own or admin" on storage.objects;

create policy "ad-videos: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ad-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "ad-videos: read all" on storage.objects
  for select using (bucket_id = 'ad-videos');

create policy "ad-videos: delete own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ad-videos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ----------------------------------------------------------------------------
-- 5. create_video_ad(...) — charge the advertiser and publish the ad, atomically.
--    The view count is DERIVED HERE from the price ($1 = 1,000 views, or the
--    fixed 150-point package), so a tampered client can't buy 10M views for $1.
-- ----------------------------------------------------------------------------
create or replace function public.create_video_ad(
  p_brand       text,
  p_video_url   text,
  p_link_url    text,
  p_category    text,
  p_country     text,
  p_method      text,
  p_cash_amount numeric default 0
)
returns public.video_ads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_ad          public.video_ads;
  v_impressions int;
  v_cost        numeric := 0;
  v_points      bigint  := 0;
  v_balance     numeric;
  v_pts_balance bigint;
  -- Pricing constants (mirrored in js/video-ads.js).
  c_cpm_cash    numeric := 1;      -- $1 per 1,000 views
  c_min_cash    numeric := 1;
  c_points_cost bigint  := 150;
  c_points_views int    := 5000;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_active();   -- suspended/banned accounts can't advertise (users-admin.sql)
  if coalesce(trim(p_brand), '') = '' then raise exception 'Brand is required'; end if;
  if coalesce(trim(p_video_url), '') = '' then raise exception 'A video is required'; end if;
  if p_method not in ('cash', 'points') then raise exception 'Invalid payment method'; end if;

  if p_method = 'cash' then
    if coalesce(p_cash_amount, 0) < c_min_cash then
      raise exception 'Minimum spend is $%', c_min_cash;
    end if;
    v_cost        := round(p_cash_amount, 2);
    v_impressions := floor((v_cost / c_cpm_cash) * 1000);

    select cash_balance into v_balance from public.profiles where id = v_uid;
    if coalesce(v_balance, 0) < v_cost then raise exception 'Not enough cash balance'; end if;
    update public.profiles set cash_balance = cash_balance - v_cost where id = v_uid;
  else
    v_points      := c_points_cost;
    v_cost        := c_points_cost;   -- stored for display; the ledger keeps them apart
    v_impressions := c_points_views;

    select points into v_pts_balance from public.profiles where id = v_uid;
    if coalesce(v_pts_balance, 0) < v_points then raise exception 'Not enough points'; end if;
    update public.profiles set points = points - v_points where id = v_uid;
  end if;

  insert into public.video_ads
    (user_id, brand, video_url, link_url, category, country, status,
     payment_method, cost, impressions_total, impressions_remaining)
  values
    (v_uid, trim(p_brand), p_video_url, nullif(trim(coalesce(p_link_url, '')), ''),
     p_category, coalesce(p_country, 'Global'), 'active',
     p_method, v_cost, v_impressions, v_impressions)
  returning * into v_ad;

  insert into public.point_transactions (user_id, type, label, points, cash)
  values (
    v_uid, 'spend', 'Video ad: ' || trim(p_brand),
    case when p_method = 'points' then -v_points else 0 end,
    case when p_method = 'cash'   then -v_cost   else 0 end
  );

  return v_ad;
end;
$$;

grant execute on function public.create_video_ad(text, text, text, text, text, text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. next_video_ad() — pick the ad to play next: live, still has views left,
--    from an advertiser in good standing, not the viewer's own, and not one they
--    were already paid for today. Oldest-first so every advertiser's inventory
--    drains fairly.
-- ----------------------------------------------------------------------------
create or replace function public.next_video_ad()
returns public.video_ads
language sql
stable
security definer
set search_path = public
as $$
  select a.*
  from public.video_ads a
  left join public.profiles p on p.id = a.user_id
  where a.status = 'active'
    and a.impressions_remaining > 0
    and (a.user_id is null or a.user_id <> auth.uid())
    and coalesce(p.status, 'active') = 'active'
    and not exists (
      select 1 from public.ad_views v
      where v.ad_id = a.id
        and v.user_id = auth.uid()
        and v.created_at > now() - interval '24 hours'
    )
  order by a.created_at asc
  limit 1;
$$;

grant execute on function public.next_video_ad() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. record_ad_view(ad_id) — the payout. Called once the viewer finishes (or
--    skips past the unlock point). Everything that matters is re-checked here:
--      • the ad is live and still has views left
--      • the viewer isn't the advertiser
--      • the viewer hasn't already been paid for this ad in the last 24h
--      • enough time has passed since their last paid view (ad_frequency_minutes)
--    Only then does it decrement inventory and credit ad_reward points.
--    Returns { awarded, points, remaining, reason }.
-- ----------------------------------------------------------------------------
create or replace function public.record_ad_view(p_ad_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_ad        public.video_ads;
  v_reward    int;
  v_gap       int;     -- required seconds between paid views
  v_last      timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_active();   -- suspended/banned accounts can't earn (users-admin.sql)

  select * into v_ad from public.video_ads where id = p_ad_id for update;
  if v_ad.id is null then
    return jsonb_build_object('awarded', false, 'points', 0, 'reason', 'not_found');
  end if;
  if v_ad.status <> 'active' or v_ad.impressions_remaining <= 0 then
    return jsonb_build_object('awarded', false, 'points', 0, 'reason', 'not_live');
  end if;
  if v_ad.user_id = v_uid then
    return jsonb_build_object('awarded', false, 'points', 0, 'reason', 'own_ad');
  end if;

  if exists (
    select 1 from public.ad_views
    where ad_id = p_ad_id and user_id = v_uid and created_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('awarded', false, 'points', 0, 'reason', 'already_watched');
  end if;

  -- Rate limit: the overlay shows an ad every ad_frequency_minutes, so paid
  -- views can't legitimately come faster than that (minus a little slack).
  v_gap := greatest(30, public.setting_int('ad_frequency_minutes', 5) * 60 - 30);
  select max(created_at) into v_last from public.ad_views where user_id = v_uid;
  if v_last is not null and v_last > now() - make_interval(secs => v_gap) then
    return jsonb_build_object('awarded', false, 'points', 0, 'reason', 'too_soon');
  end if;

  v_reward := public.setting_int('ad_reward', 5);

  update public.video_ads
    set impressions_remaining = impressions_remaining - 1,
        status = case when impressions_remaining - 1 <= 0 then 'completed' else status end
    where id = p_ad_id
    returning * into v_ad;

  insert into public.ad_views (ad_id, user_id, points_awarded)
    values (p_ad_id, v_uid, v_reward);

  update public.profiles set points = points + v_reward where id = v_uid;

  insert into public.point_transactions (user_id, type, label, points, cash)
    values (v_uid, 'earn', 'Watched video ad: ' || coalesce(v_ad.brand, 'ad'), v_reward, 0);

  return jsonb_build_object(
    'awarded', true, 'points', v_reward,
    'remaining', v_ad.impressions_remaining, 'reason', 'ok'
  );
end;
$$;

grant execute on function public.record_ad_view(uuid) to authenticated;

-- =============================================================================
-- Done. Video ads are now real: the file is uploaded to the ad-videos bucket,
-- the advertiser is charged with server-derived view counts, the overlay plays
-- live ads, and each completed watch pays the viewer through record_ad_view().
-- =============================================================================
