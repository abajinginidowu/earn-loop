# EarnLoop — Supabase Integration Progress

**Date:** 2026-07-21 · **Updated:** 2026-07-22 (video ads, referral loop, ban enforcement — see §11)
**Project:** EarnLoop — reward-based social promotion platform (vanilla HTML/CSS/JS + Supabase)
**This document:** everything done while wiring real authentication and a real database into the previously mock-only frontend.

---

## 1. Where we started

The frontend was fully built but ran entirely on **mock/seed data** in the browser's `localStorage` (`vanilla/js/data.js` + `store.js`). No real backend. The goal of this work: connect it to **Supabase** (auth, PostgreSQL database, storage) so accounts, points, tasks, campaigns, and admin actions are real and secure.

Supabase project: ref `rjdcdsnnnigffgjomkvm` (URL + anon key are set in `vanilla/js/supabase.js`).

---

## 2. Authentication (done)

- **Google OAuth** for register + sign-in — one button handles both (first click creates the account, later clicks sign in).
- **Email + password** sign-up. **Email confirmation is currently OFF** in Supabase (skipped for now); the site auto-detects this and goes straight to onboarding. Re-enabling later is a pure Supabase toggle — the 6-digit code UI is still in the code, just skipped.
- **First-time routing:** after Google sign-in, users land on `auth-callback.html`, which sends **new users to onboarding** and **returning users to the dashboard** (decided by the `onboarded` flag). Email login routes the same way.
- **Landing auto-forward:** signed-in visitors who open the landing page are forwarded to the dashboard (no flash).
- **Onboarding** writes the profile (country, business categories, social accounts) to the database.
- **Session guards:** app pages require a live session; `onboarding.html` requires a session; `admin-dashboard.html` requires an admin.

### Config completed (external consoles)
- **Google Cloud:** OAuth consent screen + Web OAuth client, redirect URI `https://rjdcdsnnnigffgjomkvm.supabase.co/auth/v1/callback`
- **Supabase → Auth → Providers → Google:** enabled with the client ID/secret.
- **Supabase → Auth → URL Configuration:** Site URL `http://localhost:5500`, redirect URL `http://localhost:5500/**`.

---

## 3. Admin role (done)

- An admin is identified by the tamper-proof login-token claim **`app_metadata.role = 'admin'`**.
- **To grant admin** (Supabase → SQL Editor), then sign out/in:
  ```sql
  update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
  where email = 'YOUR_EMAIL';
  ```
- An **"Admin Panel"** link appears in the sidebar + profile menu, **only for admins**.

---

## 4. Database + security (done)

Defined in **`supabase/schema.sql`** — 23 tables, Row-Level Security (RLS) on every table, a signup trigger, and seed data.

**Security model (enforced by the database, not just the UI):**
- Admin decided by the JWT role claim.
- Users can read/edit **only their own rows**.
- **Points, XP, level, role, cash balance are NOT client-writable** — locked at the column level.
- **Point/XP ledgers are read-only to clients** — nobody can credit themselves. Balances move only through trusted server-side functions.
- Config/content tables: readable by any signed-in user, writable by admins only.
- A signup trigger auto-creates each user's profile row.

**Storage:** a private **`screenshots`** bucket (per-user folders; admins can view all).

**Secure server-side functions (SECURITY DEFINER, so the browser can't cheat):**
- `approve_submission` / `reject_submission` — award or deny task points (admin-only).
- `create_campaign` — atomically charge the buyer and create the campaign + order + ledger row.
- `admin_set_user_status` / `admin_delete_user` — suspend / ban / delete users.
- `admin_overview` — platform totals + per-country breakdown for the admin dashboard.

---

## 5. Pages wired to live data (done)

| Area | Status | What's live |
|------|--------|-------------|
| Auth (login / register / Google) | Live | Real Supabase auth + routing + guards |
| Profile page | Live | Real identity + stats (fixed a mock-data bug) |
| Account Settings | Live | Pre-filled from real profile; saves persist to DB |
| Dashboard — profile card | Live | Real name, avatar, level, XP, points, cash |
| Dashboard — metrics | Live | Recent earnings, tasks today, streak, leaderboard rank |
| Dashboard — chart | Live | Your points earned per month |
| Dashboard — active campaigns | Live | Your real campaigns |
| Dashboard — leaderboard | Live | Real users ranked by points |
| Dashboard — notifications preview | Live | Your real notifications |
| Wallet | Live | Balances + transaction history |
| Tasks | Live | Load from DB; submit uploads a screenshot |
| My Tasks | Live | Your real submissions + statuses |
| Notifications | Live | Real notifications; mark-read persists |
| Create Campaign | Live | Charges points/cash securely, creates the campaign |
| Referral | Live | Real code/link/reward, your referral list, and the full capture → payout loop |
| Video Ads | Live | Upload + purchase (server-priced); the overlay plays real ads and pays for watches |
| Admin — Overview | Live | Real totals + country analytics |
| Admin — Review Queue | Live | Approve/reject → points awarded securely |
| Admin — Users | Live | Real list; suspend / ban / delete |
| Admin — Campaigns | Live | Every campaign, with owner |
| Admin — Tasks & Rewards | Live | Edit rewards / categories, saved to DB |
| Admin — Content settings | Live | Ad reward / frequency saved to DB |
| Admin — Logs | Live | Real admin audit trail |

**The full economy is live end-to-end:** earn (submit task → admin approves → points + wallet + notification) and spend (create campaign → balance charged → campaign + order + ledger) — every step server-verified.

---

## 6. SQL files & run order

Run these once each in **Supabase → SQL Editor** (all safe to re-run). Your code editor may flag them red — it lints as SQL Server; this is PostgreSQL and only runs in Supabase.

1. **`supabase/schema.sql`** — all tables, RLS, signup trigger, seed data.
2. **`supabase/tasks-and-rewards.sql`** — seeds 12 tasks, the `screenshots` bucket, approve/reject functions.
3. **`supabase/users-admin.sql`** — user `status` column, suspend/ban/delete functions, and the `assert_active()` guard the files below call.
4. **`supabase/campaigns.sql`** — the `create_campaign` charge-and-create function.
5. **`supabase/video-ads.sql`** — the `ad-videos` bucket, `ad_views` table, `create_video_ad` / `next_video_ad` / `record_ad_view`, and the `setting_int()` helper.
6. **`supabase/referrals.sql`** — `profiles.referral_code`, `claim_referral`, and the approval trigger that pays the referrer.
7. **`supabase/leaderboard-grant.sql`** — exposes the leaderboard view to the app.
8. **`supabase/admin-overview.sql`** — the `admin_overview` metrics function.
9. **`supabase/backfill-profiles.sql`** — creates profile rows for accounts made before the trigger existed (fixes the admin's own dashboard showing mock data).
10. **Manual (once):** the "grant admin" SQL from section 3.

The order matters in two places: `users-admin.sql` defines `assert_active()` (used by 4–5), and `video-ads.sql` defines `setting_int()` (used by 6). If you ever re-run `schema.sql` on its own, re-run `users-admin.sql` after it — `schema.sql` recreates the task-submission insert policy without the suspended/banned check.

---

## 7. Files created / changed

**New (frontend):** `vanilla/auth-callback.html`.
**New (SQL):** `schema.sql`, `tasks-and-rewards.sql`, `users-admin.sql`, `campaigns.sql`, `video-ads.sql`, `referrals.sql`, `leaderboard-grant.sql`, `admin-overview.sql`, `backfill-profiles.sql`.

**Changed (frontend):** `vanilla/js/supabase.js` (all DB/auth helpers), `auth.js`, `shell.js`, `onboarding.js`, `dashboard.js`, `wallet.js`, `tasks.js`, `my-tasks.js`, `notifications.js`, `create-campaign.js`, `referral.js`, `profile.js`, `settings.js`, `admin.js`; plus `landing.html`, `onboarding.html`, `admin-dashboard.html`, `dashboard.html`.

---

## 8. Bugs fixed

- **Profile + Account Settings showed mock data** — they read the profile once at load, before it hydrated. Now they re-render from the real profile (and Settings saves persist to the DB).
- **Admin's own dashboard showed mock data** — the admin account predated the signup trigger, so it had no profile row. Fixed with `backfill-profiles.sql`.

---

## 9. Still mock / not done yet

- **Gamification** — Weekly Challenge card + profile Achievements (the `challenges` / `achievements` tables exist but aren't seeded/tracked).
- **Featured video** on the dashboard (the admin "upload featured video" box is still a stub).
- **Add Funds** — still simulated; real deposits need a payment-provider webhook.
- **Bio** field has no `profiles` column yet; **email** changes go through auth, not Settings.
- **Server-side price validation** for campaigns (still trusts the client's computed price — video ads now derive theirs server-side, so `create_campaign` is the last one).
- **Screenshot AI validation** — proofs still go straight to the admin review queue.

---

## 10. Recommended next steps

1. **Gamification** — seed challenges/achievements + track per-user progress + reward on completion.
2. **Featured video** — an admin upload + a dashboard section that plays it.
3. **Server-side campaign pricing** — move the pricing engine into `create_campaign` the way `create_video_ad` does it.
4. **Admin video-ad moderation** — an admin section to review/reject ads before they go live (they publish immediately today).

---

## 11. Session 2 (2026-07-22) — video ads, referrals, ban enforcement

Everything below was previously simulated in the browser and is now server-owned.

### Video ads are real (`supabase/video-ads.sql`)

- The chosen video is **uploaded** to a new public `ad-videos` Storage bucket (writes confined to `ad-videos/<user_id>/…`), and the overlay plays the actual file.
- `create_video_ad()` charges the advertiser and **derives the view count from the price server-side** ($1 = 1,000 views, or the fixed 150-point / 5,000-view package) — a tampered client can't buy 10M views for $1.
- `next_video_ad()` picks what to play: live, views remaining, advertiser in good standing, never the viewer's own ad, never one they were already paid for in the last 24h. Oldest-first, so inventory drains fairly.
- `record_ad_view()` is the payout. The browser only says "I finished ad X"; the server re-checks everything, decrements the ad's remaining views (auto-completing it at 0), credits the current `ad_reward`, and writes the ledger row. A new **`ad_views`** table records each paid view (read-only to clients) and backs the rate limit: paid views can't come faster than `ad_frequency_minutes`, so the reward can't be farmed in a loop.
- **The admin's settings are now live**: `shell.js` pulls `ad_reward` / `ad_frequency_minutes` / `referral_reward` from the DB into the store on every page load, so editing them in the admin panel changes the real behaviour.
- The overlay was rebuilt to render **once** instead of every second (re-rendering restarted the `<video>`), and now plays, mutes/autoplays, and finishes on the video's natural end or on skip.

### The referral loop closes (`supabase/referrals.sql`)

- `profiles.referral_code` — a real stored code (`HANDLE-ABCD`), generated by a trigger for new accounts and backfilled for existing ones. The Referral page shows it and builds the invite link from it.
- **Capture:** landing + auth pages read `?ref=` into `localStorage`; an invited visitor lands on the Register tab. Once the new account has a session (onboarding), `claim_referral()` attributes it — refusing self-referral, double claims, and accounts older than 7 days.
- **Payout:** a trigger on `task_submissions` fires when a submission becomes `approved`. Once the friend has enough approved tasks (`referral_required_tasks`, default 1, admin-editable) the referrer is paid the current `referral_reward`, the referral flips to `rewarded`, and both a ledger row and a notification are written. It's a trigger rather than client code so it fires no matter *how* a submission gets approved.

### Suspend / ban actually bites (`supabase/users-admin.sql`)

Supabase mints the JWT before our code runs, so this is two halves:

- **Browser:** login and every guarded page check `account_status()`; a suspended/banned account is signed straight back out with an explanation on the auth page.
- **Database (the half that matters):** `assert_active()` is called by `create_campaign`, `create_video_ad`, and `record_ad_view`; RLS now blocks blocked users from inserting task proof; and a banned advertiser's ads stop being served.

### Files touched

**New SQL:** `supabase/video-ads.sql`, `supabase/referrals.sql`.
**Changed SQL:** `users-admin.sql` (status helpers + submission policy), `campaigns.sql` (guard).
**Changed frontend:** `js/supabase.js` (video-ad, referral, settings and status helpers), `js/shell.js` (live ad overlay + settings hydration + `EL.refreshUser`), `js/video-ads.js` (real upload/purchase/history), `js/referral.js` (real code + link), `js/auth.js` (`?ref=` capture, blocked-account handling), `js/onboarding.js` (referral claim), `js/landing.js` (`?ref=` capture), `css/app.css` (video player in the ad modal).

---

## 12. Session 3 (2026-07-22) — admin video uploads, session lifetime, shell perf

**No new SQL.** `featured_videos` and `video_ads` were already admin-writable under RLS, and both uploads reuse the existing `ad-videos` bucket.

### Admin can now upload videos (Admin → Content & Ads)

- **Featured video** — title + description + file → uploads, inserts a `featured_videos` row, and lists what's published with Show/Hide/Delete. The dashboard's featured card (previously hardcoded "Platform Update 2.4") now plays the newest active one, and shows an honest empty state when there is none.
- **Platform ad** — brand + view count + optional link + file → inserts a `video_ads` row with `user_id = null`. Platform-owned means nobody is charged, the view count is set directly rather than derived from a price, it stays out of the admin's personal ad history, and — unlike a user's ad — it plays for everyone including the admin who posted it.
- **Running Ads** list shows every ad on the platform with its advertiser and delivery progress, with a Stop action.
- Both forms share one `wireVideoForm()` helper (pick → local preview → upload → insert), since they differ only in required fields and the row they write.

### Sessions now end when the browser closes

`js/supabase.js` creates the client with `auth.storage = sessionStorage` instead of the default localStorage, and purges any `sb-*-auth-token` left behind by the old persistent setup. `landing.html`'s auto-forward reads sessionStorage to match.

**Known trade-off:** sessionStorage is per-*tab*. Navigating within a tab is fine, but a link opened in a new tab starts signed out. To go back to persistent sessions, set `store = window.localStorage` in `js/supabase.js` and flip the same check in `landing.html`.

### Fixed: sidebar/header missing for seconds on every page load

The shell waited on **four** sequential round trips before drawing anything — the Supabase CDN script, `getSession()`, the profile, and (as of session 2) the settings and the suspended/banned check. Fixes:

- If the tab holds a session token, the shell paints **immediately** from the store — which already caches the real profile from the previous page — then verifies in the background. The guard is unchanged; it just no longer blocks first paint. `refreshChrome()` updates the avatar/profile menu in place afterwards (in place, because replacing the element would strip the handlers bound in `wire()`), and rebuilds the nav only if the JWT disagrees about admin.
- `requireAuth()` no longer awaits `account_status()`; `shell.js` calls `enforceStatus()` after rendering. The database refuses blocked users either way.
