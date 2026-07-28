# CAPTCHA (Cloudflare Turnstile)

> **Status: OFF.** `ENABLED = false` in [`vanilla/js/captcha.js`](../vanilla/js/captcha.js).
> Nothing loads from Cloudflare, no widget renders, and auth behaves exactly as it
> did before CAPTCHA existed. The wiring is all in place — turning it on is one line
> plus a Supabase setting.

Turnstile is wired into the auth page, and Supabase verifies the token server-side
once both ends are switched on. Follow this page to enable it.

| File | Role |
|---|---|
| [`vanilla/js/captcha.js`](../vanilla/js/captcha.js) | Loads Turnstile, renders widgets, hands out tokens. **The site key lives here.** |
| [`vanilla/js/supabase.js`](../vanilla/js/supabase.js) | Passes `captchaToken` on signup / login / resend |
| [`vanilla/js/auth.js`](../vanilla/js/auth.js) | Fetches a token before each call, resets after |
| [`vanilla/auth.html`](../vanilla/auth.html) | Three `[data-captcha]` containers |

## What is and isn't protected

Protected — Supabase rejects these without a valid token:

- **Register** (`signUp`)
- **Log in** (`signInWithPassword`)
- **Resend code** (`resend`)

Not protected, by design:

- **Verifying the 6-digit code** — Supabase doesn't gate `/verify`. The code is
  itself the proof, and it was only issued behind a CAPTCHA.
- **Sign in with Google** — OAuth is a redirect to Google, so there's no form to
  attach a token to. Google runs its own abuse checks. Turning CAPTCHA on cannot
  cover this path, so it stays open by nature.

Supabase's CAPTCHA setting is **one global switch** — you can't enable it for
signup only and leave login alone.

## Switching it on

### 1. Create the widget

1. <https://dash.cloudflare.com> → **Turnstile** → **Add widget**
2. Add every hostname that serves the app, as bare hostnames — no `https://`,
   no port, no trailing slash:
   - `your-site.netlify.app`
   - `localhost` (so local dev keeps working)
3. Widget mode: **Managed** (Cloudflare decides when to challenge)
4. Copy both keys. The **site key** is public; the **secret key** is not.

If the hostname field rejects what you type, it wants a real registered domain.
`localhost` and some free subdomains can be refused depending on the account —
add whichever hostname it accepts, and note that the widget only works on the
hostnames listed here.

### 2. Turn it on in the frontend

In [`vanilla/js/captcha.js`](../vanilla/js/captcha.js):

```js
var ENABLED  = false;                        // ← set to true
var SITE_KEY = "1x00000000000000000000AA";   // ← your real site key
```

The site key is meant to be public; it ships in the browser. The secret key never
goes in this repo.

### 3. Deploy the frontend — before touching Supabase

Push and let Netlify publish. **Do this first.** See the warning below.

### 4. Enable it in Supabase

Supabase Dashboard → **Authentication → Attack Protection** → *Enable CAPTCHA protection*:

- **Provider:** Cloudflare Turnstile
- **Secret key:** the secret from step 1

Save.

## ⚠️ Order matters — this can lock everyone out

Supabase starts rejecting every signup and login the moment you save that setting.
A browser running the *old* JavaScript sends no token, so **if you enable it in
Supabase before the new frontend is live, nobody can sign in or register** — including you.

So: **deploy the frontend first, enable in Supabase second.**

The reverse order is safe: sending a token while CAPTCHA is off is harmless,
Supabase just ignores it. That's why step 3 comes before step 4.

If you do lock yourself out, turn the setting back off in the dashboard — access
returns immediately, no redeploy needed.

## Testing

Cloudflare's test keys work on any domain and never show a real challenge:

| Purpose | Site key | Secret key |
|---|---|---|
| Always passes | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always blocks | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |
| Forces an interactive challenge | `3x00000000000000000000FF` | — |

Pair the *always blocks* keys on both sides to confirm your error handling: the
form should say "Verification failed…" rather than hanging or showing a raw
Supabase error.

## Notes

**If Turnstile can't load** (ad blocker, offline), `captcha.js` resolves a null
token after 8 seconds rather than hanging the form. The request then fails
server-side — the safe direction, and the user sees a readable message instead of
a spinner that never stops.

**Tokens are single-use.** Every attempt calls `reset()` so the next submit gets a
fresh one; reusing a token is rejected by Supabase.

**On screens under 360px** the widget is scaled to 86% — Turnstile won't render
narrower than 300px, which is wider than the form on a 320px phone.

**Rate limiting is separate.** CAPTCHA raises the cost of scripted abuse but isn't
a rate limit; Supabase's own auth rate limits still apply and are configured on
the same Attack Protection page.
