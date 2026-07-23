-- =============================================================================
-- EarnLoop — Campaign creation: one secure, atomic "spend + create" function.
-- Run AFTER schema.sql and users-admin.sql (which defines assert_active), in
-- Supabase → SQL Editor. Re-runnable.
--
-- Why a function: buying a campaign must deduct points/cash from the buyer AND
-- create the campaign + order + ledger row as ONE atomic operation. Balances and
-- the ledger aren't client-writable, so this SECURITY DEFINER function does it
-- server-side, refusing the purchase if the buyer can't afford it.
--
-- NOTE (known limitation): the price is passed in from the client's pricing
-- engine. The function enforces the buyer HAS enough balance and deducts exactly
-- what's charged, but does not yet re-derive the price server-side — hardening
-- that (moving the pricing engine into the DB / an edge function) is a later step.
-- =============================================================================

create or replace function public.create_campaign(
  p_title             text,
  p_platform          text,
  p_type              text,
  p_target            int,
  p_cost              numeric,
  p_method            text,
  p_points_cost       bigint,
  p_country           text default null,
  p_business_category text default null
)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_campaign public.campaigns;
  v_points   bigint;
  v_cash     numeric;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_active();   -- suspended/banned accounts can't spend (users-admin.sql)
  if p_method not in ('cash', 'points') then raise exception 'Invalid payment method'; end if;
  if coalesce(p_cost, 0) < 0 or coalesce(p_points_cost, 0) < 0 then raise exception 'Invalid cost'; end if;

  -- Charge the buyer (refuse if short).
  if p_method = 'points' then
    select points into v_points from public.profiles where id = v_uid;
    if coalesce(v_points, 0) < p_points_cost then raise exception 'Not enough points'; end if;
    update public.profiles set points = points - p_points_cost where id = v_uid;
  else
    select cash_balance into v_cash from public.profiles where id = v_uid;
    if coalesce(v_cash, 0) < p_cost then raise exception 'Not enough cash balance'; end if;
    update public.profiles set cash_balance = cash_balance - p_cost where id = v_uid;
  end if;

  insert into public.campaigns
    (user_id, title, platform, type, target, progress, cost, method, status, country, business_category)
  values
    (v_uid, p_title, p_platform, p_type, p_target, 0, p_cost, p_method, 'active', p_country, p_business_category)
  returning * into v_campaign;

  insert into public.campaign_orders (campaign_id, user_id, amount_cash, amount_points, payment_method, status)
  values (
    v_campaign.id, v_uid,
    case when p_method = 'cash'   then p_cost        else 0 end,
    case when p_method = 'points' then p_points_cost else 0 end,
    p_method, 'paid'
  );

  insert into public.point_transactions (user_id, type, label, points, cash)
  values (
    v_uid, 'spend', 'Campaign: ' || p_title,
    case when p_method = 'points' then -p_points_cost else 0 end,
    case when p_method = 'cash'   then -p_cost        else 0 end
  );

  return v_campaign;
end;
$$;

grant execute on function public.create_campaign(text, text, text, int, numeric, text, bigint, text, text) to authenticated;

-- =============================================================================
-- Done. Create Campaign now charges the buyer and records the campaign, order,
-- and ledger entry atomically.
-- =============================================================================
