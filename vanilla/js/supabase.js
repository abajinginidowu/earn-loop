/* =============================================================================
   EarnLoop — Supabase client + auth helpers
   -----------------------------------------------------------------------------
   Loaded AFTER the Supabase CDN library (which defines window.supabase).
   Exposes a small `window.SB` API used by auth.js and the app pages.

   >>> SETUP: paste your project's values below.
       Supabase Dashboard → Project Settings → API
         • Project URL  → SUPABASE_URL
         • anon public  → SUPABASE_ANON_KEY   (safe to expose; RLS protects data)
   ============================================================================= */
(function () {
  "use strict";

  /* ----------------------- CONFIG — replace these ------------------------ */
  var SUPABASE_URL = "https://rjdcdsnnnigffgjomkvm.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqZGNkc25ubmlnZmZnam9ta3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NDkxNjEsImV4cCI6MjEwMDEyNTE2MX0.a09aJk2BKH8WYezQWZ_TdXSVBaAWj_d5z3cj-bplEE4";
  /* ----------------------------------------------------------------------- */

  var configured =
    SUPABASE_URL.indexOf("YOUR-PROJECT-REF") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR-ANON") === -1;

  if (!window.supabase || !window.supabase.createClient) {
    console.error("[SB] Supabase library not loaded. Add the CDN <script> before js/supabase.js.");
    return;
  }
  if (!configured) {
    console.warn("[SB] Supabase URL/key not set yet — edit the CONFIG block in js/supabase.js.");
  }

  /* --- Session lifetime --------------------------------------------------
     Sessions live in sessionStorage, not localStorage, so closing the browser
     signs the user out. Trade-off to know: sessionStorage is per-TAB, so a link
     opened in a new tab starts signed out. Navigating inside one tab is fine.
     Switch `store` back to window.localStorage to make sessions persist. */
  var store = null;
  try {
    window.sessionStorage.setItem("el-probe", "1");
    window.sessionStorage.removeItem("el-probe");
    store = window.sessionStorage;
  } catch (e) {
    store = window.localStorage;   // private mode / storage disabled
  }

  // Purge tokens left in localStorage by the previous (persistent) setup so a
  // stale JWT isn't sitting there forever. Safe: we no longer read from it.
  if (store !== window.localStorage) {
    try {
      Object.keys(window.localStorage)
        .filter(function (k) { return /^sb-.*-auth-token$/.test(k); })
        .forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: store,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  // Turn a Supabase error into a friendly message.
  function msg(error) {
    if (!error) return "";
    return error.message || String(error);
  }

  /* --- Who am I, without a network call ---------------------------------
     client.auth.getUser() asks the auth server to re-validate the JWT on every
     call, and supabase-js serialises those calls behind a cross-tab lock. With
     several tabs open, or on a flaky mobile connection, that promise can sit
     unresolved forever — and anything awaiting it (an upload, a query) hangs
     with no error to show. Every id lookup below is only used to build a query
     the server re-authorises anyway, so read the user out of the session we
     already hold instead. `localUser()` returns getUser()'s exact shape, so
     callers are unchanged. */
  var STORAGE_KEY = (function () {
    var ref = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
    return "sb-" + ref + "-auth-token";
  })();

  function storedSession() {
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return null;
      // Newer supabase-js versions base64-encode the stored session.
      if (raw.indexOf("base64-") === 0) raw = atob(raw.slice(7));
      var s = JSON.parse(raw);
      if (s && s.currentSession) s = s.currentSession;   // very old shape
      return s && s.access_token ? s : null;
    } catch (e) {
      return null;   // unparseable / storage blocked — fall back to the client
    }
  }

  function localUser() {
    var s = storedSession();
    if (s && s.user) return Promise.resolve({ data: { user: s.user }, error: null });
    return client.auth.getSession().then(function (r) {
      var sess = r && r.data ? r.data.session : null;
      return { data: { user: sess ? sess.user : null }, error: null };
    });
  }

  /* --- Storage upload ----------------------------------------------------
     storage-js uploads with fetch(), which gives no progress events and no
     timeout: a phone-sized video on a stalled connection leaves the caller
     spinning forever with nothing to report. This posts the same multipart
     body storage-js does, over XHR, so we get a live byte count, a real
     message for every failure, and an abort when the transfer goes quiet.
     Resolves { data: { path, url }, error } — never rejects. */
  var STALL_MS = 45000;   // no bytes moved for this long → give up

  function uploadToStorage(bucket, path, file, accessToken, onProgress) {
    return new Promise(function (resolve) {
      var url = SUPABASE_URL + "/storage/v1/object/" + bucket + "/" +
                path.split("/").map(encodeURIComponent).join("/");
      var form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file, file.name);

      var xhr = new XMLHttpRequest();
      var stalled = false;
      var lastByteAt = Date.now();
      var watchdog = setInterval(function () {
        if (Date.now() - lastByteAt > STALL_MS) { stalled = true; xhr.abort(); }
      }, 5000);

      function done(result) { clearInterval(watchdog); resolve(result); }
      function fail(message) { done({ data: null, error: { message: message } }); }

      xhr.open("POST", url, true);
      xhr.setRequestHeader("authorization", "Bearer " + accessToken);
      xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
      xhr.setRequestHeader("x-upsert", "false");

      xhr.upload.onprogress = function (e) {
        lastByteAt = Date.now();
        if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          done({ data: { path: path, url: SUPABASE_URL + "/storage/v1/object/public/" + bucket + "/" + path }, error: null });
          return;
        }
        // 413 is the one users actually hit: the project's per-file size cap.
        if (xhr.status === 413) {
          fail("That video is too large for the storage limit on this project. Upload a smaller/shorter file, or raise the limit in Supabase → Storage → Settings.");
          return;
        }
        var body = {};
        try { body = JSON.parse(xhr.responseText || "{}"); } catch (e) { /* not JSON */ }
        fail(body.message || body.error || ("Upload failed (" + xhr.status + ")."));
      };
      xhr.onerror = function () { fail("Network error during upload. Check your connection and try again."); };
      xhr.ontimeout = function () { fail("The upload timed out. Try again on a stronger connection."); };
      xhr.onabort = function () {
        fail(stalled ? "The upload stalled and was cancelled. Try again, or use a smaller video." : "Upload cancelled.");
      };

      xhr.send(form);
    });
  }

  window.SB = {
    client: client,
    configured: configured,

    /* --- Sign up (email + password) ------------------------------------
       Supabase emails a 6-digit code IF the "Confirm signup" email template
       uses {{ .Token }}. `meta` is stored on the user (full_name, username). */
    signUp: function (email, password, meta, captchaToken) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { data: meta || {}, captchaToken: captchaToken || undefined },
      });
    },

    // Confirm the 6-digit code sent to the email after signUp.
    // No captchaToken: Supabase doesn't gate /verify — the code itself is the
    // proof, and it was already issued behind a CAPTCHA.
    verifySignupCode: function (email, token) {
      return client.auth.verifyOtp({ email: email, token: token, type: "signup" });
    },

    // Re-send the signup confirmation code.
    resendSignupCode: function (email, captchaToken) {
      return client.auth.resend({
        type: "signup",
        email: email,
        options: { captchaToken: captchaToken || undefined },
      });
    },

    /* --- Log in (email + password) ------------------------------------- */
    signIn: function (email, password, captchaToken) {
      return client.auth.signInWithPassword({
        email: email,
        password: password,
        options: { captchaToken: captchaToken || undefined },
      });
    },

    /* --- Google (Gmail) OAuth — one-click redirect, no code -------------
       Lands on auth-callback.html, which routes first-timers to onboarding
       and returning users to the dashboard (see onboardTarget below). */
    signInWithGoogle: function (redirectTo) {
      return client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo || absUrl("auth-callback.html"),
          // Always show Google's account chooser instead of silently
          // reusing an existing Google session.
          queryParams: { prompt: "select_account" },
        },
      });
    },

    /* --- Onboarding state (stored on the user, not localStorage) --------
       markOnboarded() stamps user_metadata.onboarded = true when the user
       finishes the profile steps; onboardTarget() reads it to decide where
       a freshly-authenticated user should land. */
    markOnboarded: function () {
      return client.auth.updateUser({ data: { onboarded: true } });
    },
    onboardTarget: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        var done = user && user.user_metadata && user.user_metadata.onboarded;
        return done ? "dashboard.html" : "onboarding.html";
      });
    },

    /* --- Session / user ------------------------------------------------- */
    signOut: function () { return client.auth.signOut(); },
    getSession: function () { return client.auth.getSession(); },
    getUser: function () { return client.auth.getUser(); },
    onAuthChange: function (cb) { return client.auth.onAuthStateChange(cb); },

    /* --- Account status (suspended / banned) ----------------------------
       Supabase issues the JWT before our code runs, so a blocked user can still
       obtain a session — we sign them straight back out. The real enforcement is
       in the database (assert_active() in every points/money function). */
    accountStatus: function () {
      return client.rpc("account_status").then(function (res) {
        return res && !res.error ? res.data : "active";
      }, function () { return "active"; });
    },

    // Sign a blocked account out and send it to auth.html with an explanation.
    // Resolves true when the caller should stop what it was doing.
    enforceStatus: function () {
      var self = this;
      return this.accountStatus().then(function (status) {
        if (status !== "suspended" && status !== "banned") return false;
        return self.signOut().then(function () {
          location.replace("auth.html?blocked=" + status);
          return true;
        });
      });
    },

    // Guard an app page: redirect to auth.html when there's no session.
    // Deliberately does NOT wait on the suspended/banned check — that costs a
    // round trip and would delay first paint. Callers run enforceStatus() in the
    // background after rendering; the database refuses blocked users regardless.
    requireAuth: function () {
      return client.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (!session) { location.replace("auth.html"); return null; }
        return session;
      });
    },

    /* --- Roles / admin --------------------------------------------------
       The role lives in app_metadata.role (secure — only settable server-side
       via the Supabase dashboard/service key, users can't change it). We fall
       back to user_metadata.role for convenience during local setup. */
    roleOf: function (user) {
      if (!user) return null;
      return (user.app_metadata && user.app_metadata.role) ||
             (user.user_metadata && user.user_metadata.role) || null;
    },
    getRole: function () {
      var self = this;
      return client.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        return session ? self.roleOf(session.user) : null;
      });
    },

    // Guard an admin-only page: no session → auth.html; non-admin → dashboard.
    requireAdmin: function () {
      var self = this;
      return client.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (!session) { location.replace("auth.html"); return null; }
        if (self.roleOf(session.user) !== "admin") { location.replace("dashboard.html"); return null; }
        return session;
      });
    },

    // Guard the auth page: bounce to the app when already signed in.
    redirectIfAuthed: function (to) {
      return client.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (session) location.replace(to || "dashboard.html");
      });
    },

    /* --- Database: profile read/write ----------------------------------
       These run through the anon key and are constrained by the RLS policies
       in supabase/schema.sql (a user can only touch their own row). */

    // Fetch the signed-in user's profile row.
    getProfile: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: null, error: { message: "No session" } };
        return client.from("profiles").select("*").eq("id", user.id).single();
      });
    },

    /* --- Tasks + submissions ------------------------------------------- */

    // Active tasks catalog (readable by any signed-in user).
    getTasks: function () {
      return client.from("tasks").select("*").eq("active", true)
        .order("created_at", { ascending: false });
    },

    // Submit proof for a task: upload the screenshot to screenshots/<uid>/… then
    // insert a pending task_submissions row. `opts` = { taskId, file }.
    submitTask: function (opts) {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { error: { message: "No session" } };
        var uid = user.id;
        function insertRow(path) {
          return client.from("task_submissions").insert({
            user_id: uid, task_id: opts.taskId,
            screenshot_url: path || null, status: "pending",
          }).select().single();
        }
        if (opts.file) {
          var ext = (opts.file.name.split(".").pop() || "png").toLowerCase();
          var path = uid + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
          return client.storage.from("screenshots").upload(path, opts.file).then(function (up) {
            if (up.error) return { error: up.error };
            return insertRow(path);
          });
        }
        return insertRow(null);
      });
    },

    /* --- Campaigns ----------------------------------------------------- */

    // Create a campaign (charges the buyer atomically, server-side). `c` =
    // { title, platform, type, target, cost, method, pointsCost, country, category }.
    createCampaign: function (c) {
      return client.rpc("create_campaign", {
        p_title: c.title, p_platform: c.platform, p_type: c.type, p_target: c.target,
        p_cost: c.cost, p_method: c.method, p_points_cost: c.pointsCost,
        p_country: c.country || null, p_business_category: c.category || null,
      });
    },
    // The signed-in user's campaigns, newest first.
    getCampaigns: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: null };
        return client.from("campaigns").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false });
      });
    },
    // Every campaign (admin only, with the owner's name).
    getAllCampaigns: function () {
      return client.from("campaigns").select("*, profiles(full_name, username)")
        .order("created_at", { ascending: false });
    },

    /* --- Leaderboard --------------------------------------------------- */
    // Top users by points (from the leaderboard view). Public ranking data.
    getLeaderboard: function (limit) {
      var q = client.from("leaderboard").select("*").order("rank", { ascending: true });
      if (limit) q = q.limit(limit);
      return q;
    },

    /* --- Referrals ----------------------------------------------------- */
    // People the signed-in user has referred, newest first.
    getReferrals: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: null };
        return client.from("referrals").select("*").eq("referrer_id", user.id)
          .order("created_at", { ascending: false });
      });
    },

    /* --- Video ads ------------------------------------------------------ */

    // Upload a video to ad-videos/<uid>/… and return its public URL. The bucket
    // is public-read (every user's overlay/dashboard has to play these) and
    // write-restricted to the uploader's own folder. `prefix` just labels the
    // file so featured videos and ads are distinguishable in the bucket.
    // `onProgress(fraction)` is optional and fires as the bytes go out, so the
    // caller can show a real percentage instead of an indefinite spinner.
    uploadVideo: function (file, prefix, onProgress) {
      var session = storedSession();
      var pending = session && session.user
        ? Promise.resolve(session)
        : client.auth.getSession().then(function (r) { return r && r.data ? r.data.session : null; });

      return pending.then(function (sess) {
        if (!sess || !sess.user) return { data: null, error: { message: "No session — sign in again." } };
        var ext = (file.name.split(".").pop() || "mp4").toLowerCase();
        var path = sess.user.id + "/" + (prefix || "ad") + "_" + Date.now() + "_" +
                   Math.random().toString(36).slice(2, 8) + "." + ext;
        return uploadToStorage("ad-videos", path, file, sess.access_token, onProgress);
      });
    },
    uploadAdVideo: function (file, onProgress) { return this.uploadVideo(file, "ad", onProgress); },

    // Charge the advertiser and publish the ad. The view count is derived
    // server-side from the price, so it can't be tampered with client-side.
    // `a` = { brand, videoUrl, linkUrl, category, country, method, cashAmount }.
    createVideoAd: function (a) {
      return client.rpc("create_video_ad", {
        p_brand: a.brand, p_video_url: a.videoUrl, p_link_url: a.linkUrl || null,
        p_category: a.category || null, p_country: a.country || "Global",
        p_method: a.method, p_cash_amount: a.cashAmount || 0,
      });
    },

    // The signed-in user's own ads (any status), newest first.
    getMyVideoAds: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: null };
        return client.from("video_ads").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false });
      });
    },

    // The next ad this user should be shown (null when there's no inventory).
    nextVideoAd: function () { return client.rpc("next_video_ad"); },

    /* --- Admin: featured video + house ads -------------------------------
       Both are plain table writes — the RLS policies in schema.sql already
       restrict featured_videos and other people's video_ads to admins, so no
       extra RPC is needed. */

    // Featured videos, newest first (any signed-in user may read them).
    getFeaturedVideos: function () {
      return client.from("featured_videos").select("*").order("created_at", { ascending: false });
    },
    // Publish a featured video. `v` = { title, description, videoUrl }.
    createFeaturedVideo: function (v) {
      return client.from("featured_videos").insert({
        title: v.title, description: v.description || "", video_url: v.videoUrl, active: true,
      }).select().single();
    },
    setFeaturedVideoActive: function (id, active) {
      return client.from("featured_videos").update({ active: !!active }).eq("id", id);
    },
    deleteFeaturedVideo: function (id) {
      return client.from("featured_videos").delete().eq("id", id);
    },
    // The one video shown on the dashboard: most recent active one.
    getActiveFeaturedVideo: function () {
      return client.from("featured_videos").select("*").eq("active", true)
        .order("created_at", { ascending: false }).limit(1);
    },

    // Every video ad with its advertiser (admin only, via RLS).
    getAllVideoAds: function () {
      return client.from("video_ads").select("*, profiles(full_name, username)")
        .order("created_at", { ascending: false });
    },
    // A house ad: posted by the platform, so nobody is charged and the view
    // count is set directly instead of being derived from a price. user_id is
    // left null — that marks it as platform-owned, keeps it out of the admin's
    // personal ad history, and (unlike a user's ad) lets it play for everyone
    // including the admin who posted it.
    createHouseAd: function (a) {
      var views = Math.max(1, Number(a.views) || 0);
      return client.from("video_ads").insert({
        user_id: null, brand: a.brand, video_url: a.videoUrl,
        link_url: a.linkUrl || null, category: a.category || null,
        country: a.country || "Global", status: "active",
        payment_method: null, cost: 0,
        impressions_total: views, impressions_remaining: views,
      }).select().single();
    },
    // Pull an ad out of rotation without deleting its delivery record.
    stopVideoAd: function (id) {
      return client.from("video_ads").update({ status: "completed" }).eq("id", id);
    },

    // Report a finished watch. The server re-checks everything and decides the
    // payout — returns { awarded, points, remaining, reason }.
    recordAdView: function (adId) { return client.rpc("record_ad_view", { p_ad_id: adId }); },

    /* --- Platform settings ---------------------------------------------- */
    // Admin-configurable numbers, normalised to the app's camelCase shape.
    // Falls back to the caller's defaults for any key that isn't set yet.
    getPlatformSettings: function (defaults) {
      var d = defaults || {};
      return client.from("settings").select("*").then(function (res) {
        if (res.error) return { data: null, error: res.error };
        var m = {};
        (res.data || []).forEach(function (row) { m[row.key] = row.value; });
        function num(key, fallback) {
          var v = Number(m[key]);
          return isNaN(v) ? fallback : v;
        }
        return { data: {
          referralReward:     num("referral_reward", d.referralReward),
          xpPerLevel:         num("xp_per_level", d.xpPerLevel),
          adFrequencyMinutes: num("ad_frequency_minutes", d.adFrequencyMinutes),
          adReward:           num("ad_reward", d.adReward),
          dailyLoginBonus:    num("daily_login_bonus", d.dailyLoginBonus),
        }, error: null };
      });
    },

    /* --- Referrals: capture ---------------------------------------------
       A shared link looks like  auth.html?ref=ADA-9F2C. The code is parked in
       localStorage when the visitor lands (they may browse or sign in with
       Google before an account exists), then claimed once they have a session.
       The server decides whether the claim is valid. */
    REF_KEY: "el-referral-code",

    // Remember ?ref= from the current URL (call on any public page).
    captureReferralCode: function () {
      try {
        var code = new URLSearchParams(location.search).get("ref");
        if (code && code.trim()) localStorage.setItem(this.REF_KEY, code.trim());
      } catch (e) { /* private mode / no storage — referral is just skipped */ }
    },

    // Attribute a stored code to the signed-in account. Safe to call repeatedly:
    // claim_referral() rejects duplicates, self-referral and non-new accounts.
    claimStoredReferral: function () {
      var key = this.REF_KEY;
      var code;
      try { code = localStorage.getItem(key); } catch (e) { code = null; }
      if (!code) return Promise.resolve(null);
      return client.rpc("claim_referral", { p_code: code }).then(function (res) {
        // Clear unless the failure was transient (e.g. the profile row hasn't
        // been created yet) — then we keep it for the next page load.
        var reason = res && res.data ? res.data.reason : null;
        if (!res.error && reason !== "no_profile") {
          try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
        }
        return res.data || null;
      }, function () { return null; });
    },

    /* --- Admin: overview ----------------------------------------------- */
    // Platform totals + per-country breakdown (admin only), as one JSON object.
    adminOverview: function () { return client.rpc("admin_overview"); },

    /* --- Admin: users -------------------------------------------------- */
    getUsers: function () {
      return client.from("profiles").select("*").order("created_at", { ascending: false });
    },
    setUserStatus: function (userId, status) {
      return client.rpc("admin_set_user_status", { p_user_id: userId, p_status: status });
    },
    deleteUser: function (userId) {
      return client.rpc("admin_delete_user", { p_user_id: userId });
    },

    /* --- Admin: config (reward rules, settings, categories, logs) ------- */
    getRewardRules: function () {
      return client.from("reward_rules").select("*").order("action");
    },
    getSettings: function () {
      return client.from("settings").select("*");
    },
    getTaskCategories: function () {
      return client.from("task_categories").select("*").order("name");
    },
    getAdminLogs: function () {
      return client.from("admin_logs").select("*, profiles(full_name)")
        .order("created_at", { ascending: false }).limit(100);
    },
    // Writes (admin-only via RLS).
    updateRewardRule: function (action, points) {
      return client.from("reward_rules").upsert({ action: action, points: points }, { onConflict: "action" });
    },
    updateSetting: function (key, value) {
      return client.from("settings").upsert({ key: key, value: value }, { onConflict: "key" });
    },
    addTaskCategory: function (cat) {
      return client.from("task_categories").insert(cat).select().single();
    },
    // Append to the admin audit log (admin_id = current admin).
    adminLog: function (action, detail) {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { error: { message: "No session" } };
        return client.from("admin_logs").insert({ admin_id: user.id, action: action, detail: detail || {} });
      });
    },

    /* --- Admin: review queue ------------------------------------------- */

    // All pending submissions (admin only, via RLS), with task + submitter info.
    getPendingSubmissions: function () {
      return client.from("task_submissions")
        .select("*, tasks(title, platform, points, brand), profiles(username, full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
    },

    // Approve/reject call the SECURITY DEFINER functions (admin-gated server-side;
    // approve credits the user's points from the task row).
    approveSubmission: function (id) {
      return client.rpc("approve_submission", { p_submission_id: id });
    },
    rejectSubmission: function (id, reason) {
      return client.rpc("reject_submission", { p_submission_id: id, p_reason: reason || "Rejected" });
    },

    // Short-lived signed URL to view a private screenshot (admin/owner only).
    screenshotUrl: function (path) {
      return client.storage.from("screenshots").createSignedUrl(path, 300);
    },

    // The signed-in user's submissions (with the joined task info), newest first.
    getMySubmissions: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: null };
        return client.from("task_submissions")
          .select("*, tasks(title, platform, points, brand, action)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
      });
    },

    /* --- Notifications -------------------------------------------------- */

    // The signed-in user's notifications, newest first.
    getNotifications: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: null };
        return client.from("notifications").select("*")
          .eq("user_id", user.id).order("created_at", { ascending: false });
      });
    },
    // Mark one / all as read (clients may only flip the `unread` flag — schema.sql).
    markNotificationRead: function (id) {
      return client.from("notifications").update({ unread: false }).eq("id", id);
    },
    markAllNotificationsRead: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { error: { message: "No session" } };
        return client.from("notifications").update({ unread: false })
          .eq("user_id", user.id).eq("unread", true);
      });
    },

    // Fetch the signed-in user's point/cash transactions, newest first.
    getTransactions: function (limit) {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: { message: "No session" } };
        var q = client.from("point_transactions").select("*")
          .eq("user_id", user.id).order("created_at", { ascending: false });
        if (limit) q = q.limit(limit);
        return q;
      });
    },

    // Update the client-writable profile fields (username/full_name/avatar/
    // country/business_categories/onboarded). points/xp/level/role are locked
    // server-side and silently ignored by column grants.
    updateProfile: function (patch) {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: null, error: { message: "No session" } };
        return client.from("profiles").update(patch).eq("id", user.id).select().single();
      });
    },

    // The signed-in user's connected social accounts.
    getSocials: function () {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: [], error: null };
        return client.from("social_accounts").select("*").eq("user_id", user.id);
      });
    },
    // Upsert one social_accounts row per platform. `socials` = { p:{handle,connected} }.
    saveSocials: function (socials) {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { error: { message: "No session" } };
        var uid = user.id;
        var rows = Object.keys(socials || {}).map(function (p) {
          return { user_id: uid, platform: p, handle: socials[p].handle || "", connected: !!socials[p].connected };
        });
        if (!rows.length) return { data: [], error: null };
        return client.from("social_accounts").upsert(rows, { onConflict: "user_id,platform" });
      });
    },

    // Persist the onboarding steps: profile fields + one social_accounts row
    // per platform. `data` = { country, business_categories:[], socials:{ p:{handle,connected} } }.
    saveOnboarding: function (data) {
      return localUser().then(function (res) {
        var user = res && res.data ? res.data.user : null;
        if (!user) return { data: null, error: { message: "No session" } };
        var uid = user.id;
        return client.from("profiles").update({
          country: data.country || null,
          business_categories: data.business_categories || [],
          onboarded: true,
        }).eq("id", uid).then(function (r) {
          if (r.error) return r;
          var socials = data.socials || {};
          var rows = Object.keys(socials).map(function (p) {
            return {
              user_id: uid, platform: p,
              handle: socials[p].handle || "",
              connected: !!socials[p].connected,
            };
          });
          if (!rows.length) return r;
          return client.from("social_accounts").upsert(rows, { onConflict: "user_id,platform" });
        });
      });
    },

    errorMessage: msg,
  };

  // Build an absolute URL to a page in this app (for OAuth redirectTo).
  function absUrl(page) {
    var path = location.pathname.replace(/[^/]*$/, "");
    return location.origin + path + page;
  }
})();
