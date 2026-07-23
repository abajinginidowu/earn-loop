-- =============================================================================
-- EarnLoop — Admin overview metrics: one secure aggregation function.
-- Run AFTER schema.sql (+ campaigns.sql for revenue), in Supabase → SQL Editor.
-- Re-runnable.
--
-- Returns platform totals + a per-country breakdown as a single JSON object,
-- admin-only. Aggregating in one function is efficient and avoids exposing raw
-- rows to the client.
-- =============================================================================

create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_countries jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb) into v_countries
  from (
    select
      coalesce(p.country, 'Unknown')      as country,
      count(distinct p.id)                 as users,
      coalesce(sum(o.amount_cash), 0)      as revenue
    from public.profiles p
    left join public.campaign_orders o on o.user_id = p.id
    group by coalesce(p.country, 'Unknown')
    order by count(distinct p.id) desc
    limit 8
  ) c;

  return jsonb_build_object(
    'total_users',      (select count(*) from public.profiles),
    'pending_reviews',  (select count(*) from public.task_submissions where status = 'pending'),
    'total_campaigns',  (select count(*) from public.campaigns),
    'active_campaigns', (select count(*) from public.campaigns where status = 'active'),
    'tasks_completed',  (select count(*) from public.task_submissions where status = 'approved'),
    'total_revenue',    coalesce((select sum(amount_cash) from public.campaign_orders), 0),
    'points_awarded',   coalesce((select sum(points) from public.point_transactions where type = 'earn'), 0),
    'countries',        v_countries
  );
end;
$$;

grant execute on function public.admin_overview() to authenticated;

-- =============================================================================
-- Done. The admin Overview section can now show real platform totals + country
-- breakdown.
-- =============================================================================
