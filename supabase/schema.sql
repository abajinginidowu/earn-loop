-- =============================================================================
-- EarnLoop — Supabase schema, Row-Level Security, triggers, and seed data
-- -----------------------------------------------------------------------------
-- Run this ONCE in the Supabase dashboard → SQL Editor (paste + Run).
-- It is written to be re-runnable: tables use "if not exists", policies are
-- dropped-then-created, seeds use "on conflict do nothing".
--
-- Security model (frontend guards are UX only — THIS is the real enforcement):
--   • Admin is decided by the JWT claim app_metadata.role = 'admin'
--     (set via: update auth.users set raw_app_meta_data =
--       raw_app_meta_data || '{"role":"admin"}' where email = '...';
--      then the user must sign out/in so the new JWT carries the claim).
--   • Users can read/update ONLY their own rows.
--   • Sensitive columns (points, xp, level, role) are NOT client-writable at
--     all — they change only through SECURITY DEFINER functions / service key.
--   • Point/XP ledgers are read-only to clients (no client INSERT) so nobody
--     can credit themselves.
--   • Content/config tables are readable by any signed-in user, writable by
--     admins only.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions + shared helpers
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- True when the current request's JWT carries app_metadata.role = 'admin'.
-- Reads the JWT (not a table) so it never recurses through RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- Generic updated_at stamper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Profiles (1:1 with auth.users) + auto-create trigger
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text unique,
  full_name           text default '',
  email               text,
  avatar_url          text default '',
  country             text,
  business_categories text[] default '{}',
  role                text not null default 'user',   -- mirror only; JWT is authoritative
  points              bigint not null default 0,
  xp                  bigint not null default 0,
  level               int    not null default 1,
  cash_balance        numeric(12,2) not null default 0,
  streak              int    not null default 0,
  onboarded           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row automatically whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own or admin"   on public.profiles;
drop policy if exists "profiles: insert own"           on public.profiles;
drop policy if exists "profiles: update own or admin"  on public.profiles;
drop policy if exists "profiles: delete admin"         on public.profiles;

create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles: insert own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles: update own or admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles: delete admin" on public.profiles
  for delete using (public.is_admin());

-- Column-level lockdown: even on their own row, clients may only edit these
-- fields. points / xp / level / role / cash_balance are untouchable from the
-- client and must be changed via SECURITY DEFINER RPCs or the service key.
revoke update on public.profiles from authenticated;
grant  update (username, full_name, avatar_url, country, business_categories, onboarded)
  on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Social accounts
-- ----------------------------------------------------------------------------
create table if not exists public.social_accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text not null,          -- instagram | facebook | tiktok | x | linkedin | ...
  handle     text default '',
  connected  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, platform)
);
create index if not exists social_accounts_user_idx on public.social_accounts(user_id);
alter table public.social_accounts enable row level security;

drop policy if exists "social: read own or admin"  on public.social_accounts;
drop policy if exists "social: write own"           on public.social_accounts;
create policy "social: read own or admin" on public.social_accounts
  for select using (user_id = auth.uid() or public.is_admin());
create policy "social: write own" on public.social_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Lookup / config tables (read: any signed-in user · write: admin only)
-- ----------------------------------------------------------------------------
create table if not exists public.countries (
  name text primary key,
  flag text default ''
);
create table if not exists public.business_categories (
  name text primary key
);
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.reward_rules (
  id     uuid primary key default gen_random_uuid(),
  action text unique not null,
  points int not null default 0
);
create table if not exists public.task_categories (
  id    text primary key,
  name  text not null,
  icon  text default '',
  color text default ''
);

alter table public.countries           enable row level security;
alter table public.business_categories enable row level security;
alter table public.settings            enable row level security;
alter table public.reward_rules        enable row level security;
alter table public.task_categories     enable row level security;

-- A reusable read-any / write-admin pair applied to each config table.
do $$
declare t text;
begin
  foreach t in array array[
    'countries','business_categories','settings','reward_rules','task_categories'
  ] loop
    execute format('drop policy if exists "%s: read"  on public.%I', t, t);
    execute format('drop policy if exists "%s: write" on public.%I', t, t);
    execute format(
      'create policy "%s: read" on public.%I for select using (auth.role() = ''authenticated'')',
      t, t);
    execute format(
      'create policy "%s: write" on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Tasks + submissions
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id                text primary key default ('tsk_' || substr(gen_random_uuid()::text, 1, 8)),
  platform          text not null,
  action            text not null,
  title             text not null,
  brand             text,
  category          text references public.task_categories(id),
  points            int not null default 0,
  country           text default 'Global',
  business_category text,
  thumbnail         text default '',
  deadline          date,
  target            text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
alter table public.tasks enable row level security;
drop policy if exists "tasks: read"  on public.tasks;
drop policy if exists "tasks: write" on public.tasks;
create policy "tasks: read" on public.tasks
  for select using (auth.role() = 'authenticated');
create policy "tasks: write" on public.tasks
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.task_submissions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  task_id        text references public.tasks(id) on delete set null,
  screenshot_url text,
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected')),
  reject_reason  text,
  points_awarded int not null default 0,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create index if not exists submissions_user_idx   on public.task_submissions(user_id);
create index if not exists submissions_status_idx on public.task_submissions(status);
alter table public.task_submissions enable row level security;

drop policy if exists "submissions: read own or admin" on public.task_submissions;
drop policy if exists "submissions: insert own"        on public.task_submissions;
drop policy if exists "submissions: review admin"      on public.task_submissions;
drop policy if exists "submissions: delete admin"      on public.task_submissions;
-- Users submit + read their own proof; only admins change status (approve/reject).
create policy "submissions: read own or admin" on public.task_submissions
  for select using (user_id = auth.uid() or public.is_admin());
create policy "submissions: insert own" on public.task_submissions
  for insert with check (user_id = auth.uid() and status = 'pending');
create policy "submissions: review admin" on public.task_submissions
  for update using (public.is_admin()) with check (public.is_admin());
create policy "submissions: delete admin" on public.task_submissions
  for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. Campaigns + orders
-- ----------------------------------------------------------------------------
create table if not exists public.campaigns (
  id                text primary key default ('cmp_' || substr(gen_random_uuid()::text, 1, 8)),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  title             text not null,
  platform          text not null,
  type              text not null,             -- Followers | Streams | Visits | Installs | ...
  target            int  not null,
  progress          int  not null default 0,
  cost              numeric(12,2) not null default 0,
  method            text not null check (method in ('cash','points')),
  status            text not null default 'active'
                      check (status in ('active','completed','paused')),
  country           text,                      -- targeting
  business_category text,                       -- targeting
  task_type         text,                       -- targeting
  created_at        timestamptz not null default now()
);
create index if not exists campaigns_user_idx on public.campaigns(user_id);
alter table public.campaigns enable row level security;

drop policy if exists "campaigns: read own or admin" on public.campaigns;
drop policy if exists "campaigns: insert own"        on public.campaigns;
drop policy if exists "campaigns: update own or admin" on public.campaigns;
drop policy if exists "campaigns: delete own or admin" on public.campaigns;
create policy "campaigns: read own or admin" on public.campaigns
  for select using (user_id = auth.uid() or public.is_admin());
create policy "campaigns: insert own" on public.campaigns
  for insert with check (user_id = auth.uid());
create policy "campaigns: update own or admin" on public.campaigns
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "campaigns: delete own or admin" on public.campaigns
  for delete using (user_id = auth.uid() or public.is_admin());

create table if not exists public.campaign_orders (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    text references public.campaigns(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  amount_cash    numeric(12,2) not null default 0,
  amount_points  bigint not null default 0,
  payment_method text not null check (payment_method in ('cash','points')),
  status         text not null default 'paid',
  created_at     timestamptz not null default now()
);
create index if not exists orders_user_idx on public.campaign_orders(user_id);
alter table public.campaign_orders enable row level security;
drop policy if exists "orders: read own or admin" on public.campaign_orders;
drop policy if exists "orders: insert own"        on public.campaign_orders;
create policy "orders: read own or admin" on public.campaign_orders
  for select using (user_id = auth.uid() or public.is_admin());
create policy "orders: insert own" on public.campaign_orders
  for insert with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. Point / XP ledgers (READ-ONLY to clients — no client INSERT/UPDATE)
--    Balances are moved only by SECURITY DEFINER functions / the service key,
--    so a user can never credit themselves.
-- ----------------------------------------------------------------------------
create table if not exists public.point_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,          -- earn | spend | referral | purchase | withdraw
  label      text not null,
  points     bigint not null default 0,
  cash       numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists point_tx_user_idx on public.point_transactions(user_id);
alter table public.point_transactions enable row level security;
drop policy if exists "point_tx: read own or admin" on public.point_transactions;
create policy "point_tx: read own or admin" on public.point_transactions
  for select using (user_id = auth.uid() or public.is_admin());

create table if not exists public.xp_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null default 0,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists xp_tx_user_idx on public.xp_transactions(user_id);
alter table public.xp_transactions enable row level security;
drop policy if exists "xp_tx: read own or admin" on public.xp_transactions;
create policy "xp_tx: read own or admin" on public.xp_transactions
  for select using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. Notifications (read own · mark-read own · create by admin/server)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'info',   -- info | success | warning | destructive
  title      text not null,
  message    text default '',
  icon       text default '',
  unread     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id);
alter table public.notifications enable row level security;
drop policy if exists "notifications: read own or admin" on public.notifications;
drop policy if exists "notifications: update own"        on public.notifications;
drop policy if exists "notifications: insert admin"      on public.notifications;
create policy "notifications: read own or admin" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications: update own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: insert admin" on public.notifications
  for insert with check (public.is_admin());
-- Clients may only flip the `unread` flag on their notifications.
revoke update on public.notifications from authenticated;
grant  update (unread) on public.notifications to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Referrals
-- ----------------------------------------------------------------------------
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.profiles(id) on delete cascade,
  referred_id   uuid references public.profiles(id) on delete set null,
  referred_name text,
  code          text,
  status        text not null default 'invited'
                  check (status in ('invited','pending','rewarded')),
  reward_points int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);
alter table public.referrals enable row level security;
drop policy if exists "referrals: read own or admin" on public.referrals;
drop policy if exists "referrals: insert own"        on public.referrals;
create policy "referrals: read own or admin" on public.referrals
  for select using (referrer_id = auth.uid() or public.is_admin());
create policy "referrals: insert own" on public.referrals
  for insert with check (referrer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9. Video ads + featured videos
-- ----------------------------------------------------------------------------
create table if not exists public.video_ads (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references public.profiles(id) on delete cascade,
  brand                  text,
  video_url              text,
  category               text,
  country               text default 'Global',
  status                 text not null default 'pending'
                           check (status in ('pending','active','completed','rejected')),
  payment_method         text check (payment_method in ('cash','points')),
  cost                   numeric(12,2) not null default 0,
  impressions_total      int not null default 0,
  impressions_remaining  int not null default 0,
  created_at             timestamptz not null default now()
);
create index if not exists video_ads_user_idx on public.video_ads(user_id);
alter table public.video_ads enable row level security;
drop policy if exists "video_ads: read"        on public.video_ads;
drop policy if exists "video_ads: write own or admin" on public.video_ads;
-- Any signed-in user may read ACTIVE ads (the overlay plays them); owners/admins
-- can see their own in any state.
create policy "video_ads: read" on public.video_ads
  for select using (status = 'active' or user_id = auth.uid() or public.is_admin());
create policy "video_ads: write own or admin" on public.video_ads
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create table if not exists public.featured_videos (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text default '',
  video_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.featured_videos enable row level security;
drop policy if exists "featured: read"  on public.featured_videos;
drop policy if exists "featured: write" on public.featured_videos;
create policy "featured: read" on public.featured_videos
  for select using (auth.role() = 'authenticated');
create policy "featured: write" on public.featured_videos
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. Gamification: challenges + achievements (+ per-user progress)
-- ----------------------------------------------------------------------------
create table if not exists public.challenges (
  id       text primary key,
  type     text not null check (type in ('weekly','monthly','seasonal')),
  title    text not null,
  target   int not null default 0,
  reward   int not null default 0,
  ends_at  timestamptz
);
create table if not exists public.achievements (
  id     text primary key,
  name   text not null,
  descr  text default '',
  icon   text default '',
  target int
);
alter table public.challenges   enable row level security;
alter table public.achievements enable row level security;
drop policy if exists "challenges: read"    on public.challenges;
drop policy if exists "challenges: write"   on public.challenges;
drop policy if exists "achievements: read"  on public.achievements;
drop policy if exists "achievements: write" on public.achievements;
create policy "challenges: read" on public.challenges
  for select using (auth.role() = 'authenticated');
create policy "challenges: write" on public.challenges
  for all using (public.is_admin()) with check (public.is_admin());
create policy "achievements: read" on public.achievements
  for select using (auth.role() = 'authenticated');
create policy "achievements: write" on public.achievements
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.user_challenges (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null references public.challenges(id) on delete cascade,
  progress     int not null default 0,
  completed    boolean not null default false,
  primary key (user_id, challenge_id)
);
create table if not exists public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked       boolean not null default false,
  progress       int not null default 0,
  primary key (user_id, achievement_id)
);
alter table public.user_challenges   enable row level security;
alter table public.user_achievements enable row level security;
drop policy if exists "user_challenges: rw own"   on public.user_challenges;
drop policy if exists "user_achievements: rw own" on public.user_achievements;
create policy "user_challenges: rw own" on public.user_challenges
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());
create policy "user_achievements: rw own" on public.user_achievements
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. Admin audit log (admin-only, all actions)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_logs (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  detail     jsonb default '{}',
  created_at timestamptz not null default now()
);
alter table public.admin_logs enable row level security;
drop policy if exists "admin_logs: admin only" on public.admin_logs;
create policy "admin_logs: admin only" on public.admin_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 12. Leaderboard (a view over profiles — read-only, ranks by points)
-- ----------------------------------------------------------------------------
create or replace view public.leaderboard as
  select
    row_number() over (order by points desc) as rank,
    id, username, full_name, avatar_url, points, level
  from public.profiles;

-- ----------------------------------------------------------------------------
-- 13. Seed lookup / config data (idempotent)
-- ----------------------------------------------------------------------------
insert into public.countries (name, flag) values
  ('Nigeria','🇳🇬'),('Ghana','🇬🇭'),('Kenya','🇰🇪'),('South Africa','🇿🇦'),
  ('United States','🇺🇸'),('United Kingdom','🇬🇧'),('India','🇮🇳'),
  ('Philippines','🇵🇭'),('Brazil','🇧🇷'),('Egypt','🇪🇬')
on conflict (name) do nothing;

insert into public.business_categories (name) values
  ('Fashion'),('Beauty'),('Technology'),('Music'),('Finance'),('Gaming'),
  ('Health'),('Food & Beverage'),('Nonprofit'),('Education'),('Travel'),('Real Estate')
on conflict (name) do nothing;

insert into public.task_categories (id, name, icon, color) values
  ('cat_social','Social Media','share2','#2563EB'),
  ('cat_music','Music','music','#7C3AED'),
  ('cat_web','Website','globe','#22C55E'),
  ('cat_app','Application','smartphone','#F59E0B'),
  ('cat_community','Community','users','#EF4444')
on conflict (id) do nothing;

insert into public.reward_rules (action, points) values
  ('Follow',1),('Like',1),('Comment',2),('Share',2),
  ('Website Visit (30 sec)',2),('Website Visit (60 sec)',4),('Website Visit (2 min)',5),
  ('Music Stream',4),('Join Group',2),('Join Channel',2),('Follow Channel',2),
  ('Watch Video Ad',5),('App Install',7),('Install + Registration',10),
  ('Email Subscription',2),('Product Review',5)
on conflict (action) do nothing;

-- Admin-configurable platform settings (points/frequency/rewards).
insert into public.settings (key, value) values
  ('ad_reward',            '5'::jsonb),
  ('ad_frequency_minutes', '5'::jsonb),
  ('referral_reward',      '20'::jsonb),
  ('daily_login_bonus',    '5'::jsonb)
on conflict (key) do nothing;

-- =============================================================================
-- Done. Next: grant yourself admin (see header), sign out/in, and the frontend
-- can start reading/writing these tables through the anon key under RLS.
-- =============================================================================
