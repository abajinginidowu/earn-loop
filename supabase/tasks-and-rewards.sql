-- =============================================================================
-- EarnLoop — Tasks earning loop: seed tasks, screenshots Storage bucket, and
-- the secure point-award functions (approve/reject submissions).
-- Run AFTER schema.sql, in Supabase → SQL Editor. Re-runnable.
--
-- WHY functions for awarding points:
--   profiles.points and point_transactions are NOT client-writable (schema.sql),
--   so a user can never credit themselves. Points move ONLY here, inside
--   SECURITY DEFINER functions that (a) require an admin caller and (b) read the
--   reward amount from the task row — never from anything the client sent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed the tasks catalog (idempotent) so the Tasks page has content.
--    Admins can add/edit more later (tasks table is admin-writable).
-- ----------------------------------------------------------------------------
insert into public.tasks (id, platform, action, title, brand, category, points, country, business_category, deadline, target) values
  ('tsk_1001','instagram','Follow','Follow @nova.skincare on Instagram','Nova Skincare','cat_social',1,'Global','Beauty','2026-08-20','@nova.skincare'),
  ('tsk_1002','tiktok','Like','Like the launch reel for Lumo Sneakers','Lumo Sneakers','cat_social',1,'Nigeria','Fashion','2026-08-15','https://www.tiktok.com/@lumosneakers/video/7412093'),
  ('tsk_1003','youtube','Subscribe','Subscribe to Byte Sized Tech','Byte Sized Tech','cat_social',1,'Global','Technology','2026-09-01','https://youtube.com/@bytesizedtech'),
  ('tsk_1004','x','Repost','Repost the announcement thread','Flux Finance','cat_social',2,'Global','Finance','2026-08-18','https://x.com/fluxfinance/status/1789452130'),
  ('tsk_1005','spotify','Stream','Stream "Midnight Drive" 3x','Kairo Beats','cat_music',4,'Global','Music','2026-08-25','https://open.spotify.com/track/2xMidnightDrive'),
  ('tsk_1006','website','Timer Verification','Visit orbitstudio.io for 60 seconds','Orbit Studio','cat_web',4,'Global','Technology','2026-08-22','https://orbitstudio.io'),
  ('tsk_1007','application','Install + Registration','Install Pulse Fitness and create an account','Pulse Fitness','cat_app',10,'Global','Health','2026-09-05','https://play.google.com/store/apps/details?id=io.pulsefitness'),
  ('tsk_1008','telegram','Join Channel','Join the Aurora Trading channel','Aurora Trading','cat_community',2,'Global','Finance','2026-08-19','https://t.me/auroratrading'),
  ('tsk_1009','instagram','Comment','Comment on the giveaway post','Nova Skincare','cat_social',2,'Global','Beauty','2026-08-21','https://instagram.com/p/Cgiveaway123'),
  ('tsk_1010','discord','Join Server','Join the Nebula Gaming Discord','Nebula Gaming','cat_community',2,'Global','Gaming','2026-08-30','https://discord.gg/nebulagaming'),
  ('tsk_1011','facebook','Share','Share the community fundraiser post','Green Roots NGO','cat_social',2,'Nigeria','Nonprofit','2026-08-17','https://facebook.com/greenrootsngo/posts/845123'),
  ('tsk_1012','boomplay','Download','Download "Golden Hour" EP','Kairo Beats','cat_music',4,'Global','Music','2026-08-28','https://boomplay.com/albums/golden-hour')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Screenshots Storage bucket (private) + policies.
--    Files are stored under a per-user folder: screenshots/<user_id>/<file>.
--    Users manage only their own folder; admins can read every proof.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

drop policy if exists "screenshots: upload own"     on storage.objects;
drop policy if exists "screenshots: read own or admin" on storage.objects;
drop policy if exists "screenshots: delete own or admin" on storage.objects;

create policy "screenshots: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screenshots: read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'screenshots'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "screenshots: delete own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'screenshots'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ----------------------------------------------------------------------------
-- 3. approve_submission(id) — admin-only. Marks approved, credits the user the
--    task's reward, and writes the ledger entry. All server-side; the reward
--    amount comes from the task row, never from the client.
-- ----------------------------------------------------------------------------
create or replace function public.approve_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_task   text;
  v_status text;
  v_points int;
  v_title  text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select user_id, task_id, status
    into v_user, v_task, v_status
    from public.task_submissions
    where id = p_submission_id;

  if v_user is null then raise exception 'Submission not found'; end if;
  if v_status <> 'pending' then raise exception 'Already reviewed'; end if;

  select points, title into v_points, v_title from public.tasks where id = v_task;
  v_points := coalesce(v_points, 0);

  update public.task_submissions
    set status = 'approved', points_awarded = v_points, reviewed_at = now()
    where id = p_submission_id;

  update public.profiles set points = points + v_points where id = v_user;

  insert into public.point_transactions (user_id, type, label, points, cash)
    values (v_user, 'earn', 'Task reward: ' || coalesce(v_title, 'task'), v_points, 0);

  insert into public.notifications (user_id, type, title, message, icon)
    values (v_user, 'success', 'Task Approved',
            'Your submission was approved. +' || v_points || ' points added.', 'check-circle');

  insert into public.admin_logs (admin_id, action, detail)
    values (auth.uid(),
            'Approved submission: ' || coalesce(v_title, 'task') || ' (+' || v_points || ' pts)',
            jsonb_build_object('submission_id', p_submission_id, 'user_id', v_user, 'points', v_points));
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. reject_submission(id, reason) — admin-only. Marks rejected, no points.
-- ----------------------------------------------------------------------------
create or replace function public.reject_submission(p_submission_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  update public.task_submissions
    set status = 'rejected', reject_reason = p_reason, reviewed_at = now()
    where id = p_submission_id and status = 'pending'
    returning user_id into v_user;

  if v_user is not null then
    insert into public.notifications (user_id, type, title, message, icon)
      values (v_user, 'warning', 'Screenshot Rejected',
              coalesce(p_reason, 'Your submission was rejected.'), 'alert-triangle');

    insert into public.admin_logs (admin_id, action, detail)
      values (auth.uid(),
              'Rejected submission' || case when p_reason is not null then ': ' || p_reason else '' end,
              jsonb_build_object('submission_id', p_submission_id, 'user_id', v_user));
  end if;
end;
$$;

grant execute on function public.approve_submission(uuid) to authenticated;
grant execute on function public.reject_submission(uuid, text) to authenticated;

-- =============================================================================
-- Done. Tasks now load from the DB; users submit proof (uploaded to the
-- screenshots bucket + a pending row in task_submissions); an admin approving
-- it credits points through approve_submission().
-- =============================================================================
