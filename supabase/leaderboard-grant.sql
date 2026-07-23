-- =============================================================================
-- EarnLoop — Expose the leaderboard view to the app.
-- Run in Supabase → SQL Editor (safe to re-run).
--
-- The `leaderboard` view (defined in schema.sql) ranks every profile by points.
-- It runs with the view owner's rights (security-definer style, the Postgres
-- default), so it returns ALL users' public ranking data — which is exactly what
-- a leaderboard needs — while the profiles table itself stays own-row-only.
-- This grant lets signed-in users read the view through the API.
-- =============================================================================

grant select on public.leaderboard to anon, authenticated;
