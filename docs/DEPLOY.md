# Deploying EarnLoop to Netlify

**What gets deployed:** only the `vanilla/` folder — the hand-written HTML/CSS/JS frontend.
There is **no build step**. Netlify copies the files and serves them.

**What does NOT get deployed:** the backend. Supabase is already running as a hosted
service (project `rjdcdsnnnigffgjomkvm`); Netlify never touches it. The `supabase/*.sql`
files are run by hand in the Supabase SQL Editor, not by Netlify.

Configuration lives in [`netlify.toml`](../netlify.toml) at the repo root.

---

## 1. Deploy

### Option A — connect the GitHub repo (recommended)

Auto-deploys on every push, which suits this project because GitHub is the only durable
copy of the code.

1. Go to <https://app.netlify.com> → **Add new site** → **Import an existing project**.
2. Choose **GitHub**, authorize Netlify, and pick **`abajinginidowu/earn-loop`**
   (it's a private repo — Netlify needs permission to see it).
3. Netlify reads `netlify.toml`, so the settings below should already be filled in.
   Confirm them:
   - **Branch:** `main`
   - **Build command:** *(empty)*
   - **Publish directory:** `vanilla`
4. Click **Deploy**. You'll get a URL like `https://earn-loop.netlify.app`.

### Option B — drag and drop (quick one-off, no auto-deploy)

Drag the **`vanilla`** folder onto <https://app.netlify.com/drop>.

Note: this bypasses `netlify.toml`, so the root-URL rewrite and headers won't apply —
you'd have to open `/landing.html` directly. Use Option A for anything real.

---

## 2. Point Supabase at the new domain — REQUIRED

**Google sign-in will fail until you do this.** Supabase refuses to redirect back to a
domain it doesn't know, so a fresh deploy can register and sign in by email but breaks on
Google OAuth.

Supabase Dashboard → **Authentication → URL Configuration**:

| Field | Value |
|---|---|
| **Site URL** | `https://YOUR-SITE.netlify.app` |
| **Redirect URLs** | `https://YOUR-SITE.netlify.app/**` |

**Keep `http://localhost:5500/**` in the Redirect URLs list** so local development keeps
working. The list accepts multiple entries.

If you want Netlify **deploy previews** (the per-pull-request URLs) to support sign-in
too, also add `https://*--YOUR-SITE.netlify.app/**`.

### Google Cloud needs no change

The Google OAuth client's authorized redirect URI points at **Supabase**
(`https://rjdcdsnnnigffgjomkvm.supabase.co/auth/v1/callback`), not at your site. Google
never sees the Netlify domain, so that config stays exactly as it is.

---

## 3. Verify after deploying

1. **`/`** loads the landing page (served by the rewrite in `netlify.toml`).
2. **Register with email** → lands on onboarding.
3. **Sign in with Google** → returns to `auth-callback.html` → onboarding or dashboard.
   *If this fails, step 2 above is why.*
4. **Dashboard** shows real points/level, not mock seed data.
5. **Admin panel** (`/admin-dashboard.html`) is reachable only by an admin account.

---

## Things to know

**The anon key in `vanilla/js/supabase.js` is meant to be public.** It ships in the
browser bundle by design; Row-Level Security is what protects the data. Do not put the
`service_role` key in this repo — it bypasses RLS entirely.

**Sessions are per-tab.** The Supabase client stores auth in `sessionStorage`, so a link
opened in a new tab starts signed out. To switch to persistent sessions, set
`store = window.localStorage` in `vanilla/js/supabase.js` and flip the matching check in
`vanilla/landing.html`.

**No Content-Security-Policy is set.** `netlify.toml` sets the safe headers, but a CSP was
left out deliberately: the pages use inline `<script>` blocks and `blob:` URLs for video
and screenshot previews, so a wrong policy would silently break uploads. Worth adding
later, with each page tested against it.

**`Add Funds` is still simulated** — real deposits need a payment provider webhook, which
is server-side work and unaffected by this deploy. See `PROJECT-PROGRESS.md` §9.
