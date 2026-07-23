/* =============================================================================
   EarnLoop — Seed data (ported 1:1 from the React app's mock-data)
   -----------------------------------------------------------------------------
   This is the CONTENT of the app (users, tasks, campaigns, etc.). Edit values
   here by hand to change what the pages show. On first load it is copied into
   the browser's localStorage; edits here take effect after you clear storage or
   click "Reset demo data" (see store.js) — otherwise the saved copy is used.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Campaign pricing engine
   -----------------------------------------------------------------------------
   Every platform exposes MULTIPLE task types (Followers, Likes, Comments, …),
   each with its own pricing. Prices are derived from a per-1,000 base rate so
   they stay consistent and are trivial to tweak — edit the base rate / multiplier
   and every tier updates. The 5k / 10k tiers carry a bulk discount (×4.8 / ×8.8),
   matching the reference Instagram Followers pricing (1k=$2.50, 5k=$12, 10k=$22).
   Pricing models: `tiers` (qty packages, interpolated for custom amounts),
   `perUnit` (price × quantity, e.g. website visits) and `pricePerStream` (music).
--------------------------------------------------------------------------------- */
var EL_PRICING = (function () {
  function r(n) { return Math.round(n * 100) / 100; }
  // Standard 1k / 5k / 10k packages from a per-1,000 rate (bulk discount baked in).
  function tiers(perK) {
    return [
      { qty: 1000, price: r(perK) },
      { qty: 5000, price: r(perK * 4.8) },
      { qty: 10000, price: r(perK * 8.8) },
    ];
  }
  // The five social task types, derived from the platform's follower rate.
  function social(followerRate, followerUnit) {
    return [
      { id: "followers", unit: followerUnit || "Followers", tiers: tiers(followerRate) },
      { id: "likes",     unit: "Likes",    tiers: tiers(followerRate * 0.6) },
      { id: "comments",  unit: "Comments", tiers: tiers(followerRate * 2.4) },
      { id: "shares",    unit: "Shares",   tiers: tiers(followerRate * 1.2) },
      { id: "views",     unit: "Views",    tiers: tiers(followerRate * 0.25) },
    ];
  }
  return {
    instagram: { label: "Instagram",     taskTypes: social(2.5) },
    tiktok:    { label: "TikTok",        taskTypes: social(2.2) },
    facebook:  { label: "Facebook",      taskTypes: social(2.3) },
    youtube:   { label: "YouTube",       taskTypes: social(4.0, "Subscribers") },
    x:         { label: "X (Twitter)",   taskTypes: social(2.8) },
    linkedin:  { label: "LinkedIn",      taskTypes: social(5.0) },
    pinterest: { label: "Pinterest",     taskTypes: social(2.0) },
    website: { label: "Website", taskTypes: [
      { id: "visits",     unit: "Visits",             perUnit: [{ label: "30 Seconds", price: 0.05 }, { label: "60 Seconds", price: 0.1 }, { label: "2 Minutes", price: 0.25 }] },
      { id: "traffic",    unit: "Traffic Sessions",   tiers: tiers(3) },
      { id: "clicks",     unit: "Clicks",             tiers: tiers(8) },
      { id: "newsletter", unit: "Newsletter Signups", tiers: tiers(40) },
      { id: "forms",      unit: "Form Submissions",   tiers: tiers(60) },
    ] },
    application: { label: "Applications", taskTypes: [
      { id: "downloads",    unit: "Downloads",     tiers: [{ qty: 500, price: 150 }, { qty: 1000, price: 290 }, { qty: 5000, price: 1400 }] },
      { id: "installs",     unit: "Installs",      tiers: [{ qty: 500, price: 175 }, { qty: 1000, price: 340 }, { qty: 5000, price: 1600 }] },
      { id: "registration", unit: "Registrations", tiers: [{ qty: 500, price: 300 }, { qty: 1000, price: 580 }, { qty: 5000, price: 2750 }] },
      { id: "reviews",      unit: "Reviews",       tiers: [{ qty: 100, price: 120 }, { qty: 500, price: 575 }, { qty: 1000, price: 1100 }] },
    ] },
    music: { label: "Music Streaming", taskTypes: [
      { id: "streams",   unit: "Streams",       pricePerStream: 0.008, minimum: 10000 },
      { id: "playlist",  unit: "Playlist Adds", tiers: [{ qty: 100, price: 50 }, { qty: 500, price: 230 }, { qty: 1000, price: 440 }] },
      { id: "followers", unit: "Followers",     tiers: tiers(3) },
      { id: "likes",     unit: "Likes",         tiers: tiers(2) },
    ] },
  };
})();

window.EARNLOOP_SEED = {
  currentUser: {
    id: "usr_001",
    username: "ada.creates",
    fullName: "Ada Okafor",
    email: "ada.okafor@example.com",
    avatarUrl: "",
    country: "Nigeria",
    countryFlag: "🇳🇬",
    level: 12,
    xp: 3480,
    xpToNext: 5000,
    points: 18420,
    cashBalance: 64.5,
    streak: 9,
    joined: "2025-11-02",
    businessCategories: ["Fashion", "Music", "Technology"],
    socials: {
      instagram: { handle: "@ada.creates", connected: true },
      facebook: { handle: "", connected: false },
      tiktok: { handle: "@adacreates", connected: true },
      x: { handle: "@ada_creates", connected: true },
      linkedin: { handle: "", connected: false },
    },
    badges: ["Early Adopter", "Streak Master", "Top Referrer"],
    role: "user",
  },

  admin: {
    id: "adm_001",
    username: "platform.admin",
    fullName: "Marcus Chen",
    email: "marcus.chen@earnloop.io",
    avatarUrl: "",
    role: "admin",
  },

  taskCategories: [
    { id: "cat_social", name: "Social Media", icon: "share2", color: "#2563EB" },
    { id: "cat_music", name: "Music", icon: "music", color: "#7C3AED" },
    { id: "cat_web", name: "Website", icon: "globe", color: "#22C55E" },
    { id: "cat_app", name: "Application", icon: "smartphone", color: "#F59E0B" },
    { id: "cat_community", name: "Community", icon: "users", color: "#EF4444" },
  ],

  platforms: [
    { id: "instagram", name: "Instagram", color: "#E1306C", category: "cat_social", actions: ["Follow", "Like", "Comment", "Share", "Save", "Use Audio"] },
    { id: "facebook", name: "Facebook", color: "#1877F2", category: "cat_social", actions: ["Follow", "Like", "Comment", "Share"] },
    { id: "tiktok", name: "TikTok", color: "#000000", category: "cat_social", actions: ["Follow", "Like", "Comment", "Share", "Save", "Use Sound"] },
    { id: "youtube", name: "YouTube", color: "#FF0000", category: "cat_social", actions: ["Subscribe", "Like", "Comment", "Share", "Watch"] },
    { id: "x", name: "X (Twitter)", color: "#0F1419", category: "cat_social", actions: ["Follow", "Like", "Comment", "Bookmark", "Repost"] },
    { id: "linkedin", name: "LinkedIn", color: "#0A66C2", category: "cat_social", actions: ["Follow", "Like", "Comment", "Share"] },
    { id: "pinterest", name: "Pinterest", color: "#E60023", category: "cat_social", actions: ["Follow", "Like", "Comment", "Share"] },
    { id: "telegram", name: "Telegram", color: "#26A5E4", category: "cat_community", actions: ["Join Group", "Join Channel", "Start Bot"] },
    { id: "whatsapp", name: "WhatsApp", color: "#25D366", category: "cat_community", actions: ["View Status", "Join Group", "Follow Channel"] },
    { id: "discord", name: "Discord", color: "#5865F2", category: "cat_community", actions: ["Join Server"] },
    { id: "spotify", name: "Spotify", color: "#1DB954", category: "cat_music", actions: ["Stream", "Follow", "Download"] },
    { id: "boomplay", name: "BoomPlay", color: "#FF3B30", category: "cat_music", actions: ["Stream", "Follow", "Comment", "Download"] },
    { id: "audiomack", name: "Audiomack", color: "#FFA200", category: "cat_music", actions: ["Stream", "Follow", "Comment", "Download"] },
    { id: "apple-music", name: "Apple Music", color: "#FA243C", category: "cat_music", actions: ["Stream", "Follow", "Download"] },
    { id: "amazon-music", name: "Amazon Music", color: "#00A8E1", category: "cat_music", actions: ["Stream", "Follow", "Download"] },
    { id: "website", name: "Website", color: "#2563EB", category: "cat_web", actions: ["Visit", "Timer Verification"] },
    { id: "application", name: "Application", color: "#F59E0B", category: "cat_app", actions: ["Install", "Install + Registration"] },
  ],

  rewardRules: [
    { action: "Follow", points: 1 },
    { action: "Like", points: 1 },
    { action: "Comment", points: 2 },
    { action: "Share", points: 2 },
    { action: "Website Visit (30 sec)", points: 2 },
    { action: "Website Visit (60 sec)", points: 4 },
    { action: "Website Visit (2 min)", points: 5 },
    { action: "Music Stream", points: 4 },
    { action: "Join Group", points: 2 },
    { action: "Join Channel", points: 2 },
    { action: "Follow Channel", points: 2 },
    { action: "Watch Video Ad", points: 5 },
    { action: "App Install", points: 7 },
    { action: "Install + Registration", points: 10 },
    { action: "Email Subscription", points: 2 },
    { action: "Product Review", points: 5 },
  ],

  tasks: [
    { id: "tsk_1001", platform: "instagram", action: "Follow", title: "Follow @nova.skincare on Instagram", brand: "Nova Skincare", category: "cat_social", points: 1, country: "Global", businessCategory: "Beauty", thumbnail: "", deadline: "2026-07-20", target: "@nova.skincare" },
    { id: "tsk_1002", platform: "tiktok", action: "Like", title: "Like the launch reel for Lumo Sneakers", brand: "Lumo Sneakers", category: "cat_social", points: 1, country: "Nigeria", businessCategory: "Fashion", thumbnail: "", deadline: "2026-07-15", target: "https://www.tiktok.com/@lumosneakers/video/7412093" },
    { id: "tsk_1003", platform: "youtube", action: "Subscribe", title: "Subscribe to Byte Sized Tech", brand: "Byte Sized Tech", category: "cat_social", points: 1, country: "Global", businessCategory: "Technology", thumbnail: "", deadline: "2026-08-01", target: "https://youtube.com/@bytesizedtech" },
    { id: "tsk_1004", platform: "x", action: "Repost", title: "Repost the announcement thread", brand: "Flux Finance", category: "cat_social", points: 2, country: "Global", businessCategory: "Finance", thumbnail: "", deadline: "2026-07-18", target: "https://x.com/fluxfinance/status/1789452130" },
    { id: "tsk_1005", platform: "spotify", action: "Stream", title: 'Stream "Midnight Drive" 3x', brand: "Kairo Beats", category: "cat_music", points: 4, country: "Global", businessCategory: "Music", thumbnail: "", deadline: "2026-07-25", target: "https://open.spotify.com/track/2xMidnightDrive" },
    { id: "tsk_1006", platform: "website", action: "Timer Verification", title: "Visit orbitstudio.io for 60 seconds", brand: "Orbit Studio", category: "cat_web", points: 4, country: "Global", businessCategory: "Technology", thumbnail: "", deadline: "2026-07-22", target: "https://orbitstudio.io" },
    { id: "tsk_1007", platform: "application", action: "Install + Registration", title: "Install Pulse Fitness and create an account", brand: "Pulse Fitness", category: "cat_app", points: 10, country: "Global", businessCategory: "Health", thumbnail: "", deadline: "2026-08-05", target: "https://play.google.com/store/apps/details?id=io.pulsefitness" },
    { id: "tsk_1008", platform: "telegram", action: "Join Channel", title: "Join the Aurora Trading channel", brand: "Aurora Trading", category: "cat_community", points: 2, country: "Global", businessCategory: "Finance", thumbnail: "", deadline: "2026-07-19", target: "https://t.me/auroratrading" },
    { id: "tsk_1009", platform: "instagram", action: "Comment", title: "Comment on the giveaway post", brand: "Nova Skincare", category: "cat_social", points: 2, country: "Global", businessCategory: "Beauty", thumbnail: "", deadline: "2026-07-21", target: "https://instagram.com/p/Cgiveaway123" },
    { id: "tsk_1010", platform: "discord", action: "Join Server", title: "Join the Nebula Gaming Discord", brand: "Nebula Gaming", category: "cat_community", points: 2, country: "Global", businessCategory: "Gaming", thumbnail: "", deadline: "2026-07-30", target: "https://discord.gg/nebulagaming" },
    { id: "tsk_1011", platform: "facebook", action: "Share", title: "Share the community fundraiser post", brand: "Green Roots NGO", category: "cat_social", points: 2, country: "Nigeria", businessCategory: "Nonprofit", thumbnail: "", deadline: "2026-07-17", target: "https://facebook.com/greenrootsngo/posts/845123" },
    { id: "tsk_1012", platform: "boomplay", action: "Download", title: 'Download "Golden Hour" EP', brand: "Kairo Beats", category: "cat_music", points: 4, country: "Global", businessCategory: "Music", thumbnail: "", deadline: "2026-07-28", target: "https://boomplay.com/albums/golden-hour" },
  ],

  taskSubmissions: [
    { id: "sub_5001", taskId: "tsk_1002", taskTitle: "Like the launch reel for Lumo Sneakers", platform: "tiktok", points: 1, status: "approved", submittedAt: "2026-07-06T14:20:00", reviewedAt: "2026-07-06T15:00:00", screenshot: "" },
    { id: "sub_5002", taskId: "tsk_1005", taskTitle: 'Stream "Midnight Drive" 3x', platform: "spotify", points: 4, status: "pending", submittedAt: "2026-07-07T09:10:00", reviewedAt: null, screenshot: "" },
    { id: "sub_5003", taskId: "tsk_1008", taskTitle: "Join the Aurora Trading channel", platform: "telegram", points: 2, status: "rejected", reason: "Username in screenshot did not match your profile.", submittedAt: "2026-07-05T11:00:00", reviewedAt: "2026-07-05T18:22:00", screenshot: "" },
    { id: "sub_5004", taskId: "tsk_1001", taskTitle: "Follow @nova.skincare on Instagram", platform: "instagram", points: 1, status: "approved", submittedAt: "2026-07-04T08:40:00", reviewedAt: "2026-07-04T09:12:00", screenshot: "" },
    { id: "sub_5005", taskId: "tsk_1011", taskTitle: "Share the community fundraiser post", platform: "facebook", points: 2, status: "approved", submittedAt: "2026-07-03T19:05:00", reviewedAt: "2026-07-03T20:00:00", screenshot: "" },
    { id: "sub_5006", taskId: "tsk_1007", taskTitle: "Install Pulse Fitness and create an account", platform: "application", points: 10, status: "pending", submittedAt: "2026-07-07T07:30:00", reviewedAt: null, screenshot: "" },
  ],

  campaigns: [
    { id: "cmp_2001", title: "Nova Skincare: Instagram Followers", platform: "instagram", type: "Followers", target: 5000, progress: 3120, cost: 12, method: "cash", status: "active", createdAt: "2026-06-28" },
    { id: "cmp_2002", title: "Kairo Beats: Spotify Streams", platform: "spotify", type: "Streams", target: 10000, progress: 10000, cost: 80, method: "cash", status: "completed", createdAt: "2026-06-15" },
    { id: "cmp_2003", title: "Orbit Studio: Website Visits", platform: "website", type: "Visits", target: 2000, progress: 640, cost: 200, method: "points", status: "active", createdAt: "2026-07-01" },
    { id: "cmp_2004", title: "Pulse Fitness: App Installs", platform: "application", type: "Installs", target: 1000, progress: 210, cost: 350, method: "cash", status: "active", createdAt: "2026-07-03" },
    { id: "cmp_2005", title: "Lumo Sneakers: TikTok Likes", platform: "tiktok", type: "Likes", target: 8000, progress: 8000, cost: 40, method: "points", status: "completed", createdAt: "2026-06-10" },
  ],

  pricingEngine: EL_PRICING,

  notifications: [
    { id: "ntf_1", type: "success", title: "Task Approved", message: "Your Instagram follow task was approved. +1 point added.", time: "2026-07-07T08:12:00", unread: true, icon: "check-circle" },
    { id: "ntf_2", type: "info", title: "Campaign Milestone", message: "Nova Skincare campaign hit 60% of its follower goal.", time: "2026-07-07T06:40:00", unread: true, icon: "trending-up" },
    { id: "ntf_3", type: "warning", title: "Screenshot Rejected", message: "Telegram join screenshot rejected: username mismatch.", time: "2026-07-05T18:22:00", unread: false, icon: "alert-triangle" },
    { id: "ntf_4", type: "info", title: "Referral Joined", message: "Chidi B. signed up using your referral link.", time: "2026-07-05T12:05:00", unread: false, icon: "user-plus" },
    { id: "ntf_5", type: "success", title: "Level Up!", message: "You reached Level 12. New badge unlocked: Streak Master.", time: "2026-07-04T09:00:00", unread: false, icon: "award" },
    { id: "ntf_6", type: "info", title: "Weekly Challenge", message: "New weekly challenge available: Complete 15 tasks for 50 bonus points.", time: "2026-07-03T09:00:00", unread: false, icon: "flag" },
  ],

  walletTransactions: [
    { id: "txn_1", type: "earn", label: "Task reward: Follow @nova.skincare", points: 1, cash: 0, date: "2026-07-04T09:12:00" },
    { id: "txn_2", type: "earn", label: "Task reward: Share fundraiser post", points: 2, cash: 0, date: "2026-07-03T20:00:00" },
    { id: "txn_3", type: "spend", label: "Campaign: Orbit Studio Website Visits", points: -2000, cash: 0, date: "2026-07-01T10:00:00" },
    { id: "txn_4", type: "referral", label: "Referral bonus: Chidi B. joined", points: 20, cash: 0, date: "2026-06-30T15:22:00" },
    { id: "txn_5", type: "purchase", label: "Purchased 5,000 points", points: 5000, cash: -12.0, date: "2026-06-29T11:00:00" },
    { id: "txn_6", type: "earn", label: "Watched video ad", points: 5, cash: 0, date: "2026-06-28T21:14:00" },
    { id: "txn_7", type: "withdraw", label: "Cash withdrawal to bank", points: 0, cash: -30.0, date: "2026-06-25T13:00:00" },
  ],

  referrals: {
    code: "ADA-CREATES-92",
    link: "https://earnloop.io/r/ADA-CREATES-92",
    rewardPerReferral: 20,
    totalInvited: 34,
    totalJoined: 21,
    totalEarned: 420,
    list: [
      { name: "Chidi Balogun", avatarUrl: "", status: "rewarded", joined: "2026-06-30", points: 20 },
      { name: "Fatima Ibrahim", avatarUrl: "", status: "rewarded", joined: "2026-06-24", points: 20 },
      { name: "Tunde Adeyemi", avatarUrl: "", status: "pending", joined: "2026-07-05", points: 0 },
      { name: "Grace Eze", avatarUrl: "", status: "rewarded", joined: "2026-06-12", points: 20 },
      { name: "Sam Okoro", avatarUrl: "", status: "invited", joined: "", points: 0 },
    ],
  },

  leaderboard: [
    { rank: 1, name: "Kemi Adisa", avatarUrl: "", points: 42800, level: 21 },
    { rank: 2, name: "Ibrahim Musa", avatarUrl: "", points: 39120, level: 19 },
    { rank: 3, name: "Zainab Yusuf", avatarUrl: "", points: 35990, level: 18 },
    { rank: 4, name: "Ada Okafor", avatarUrl: "", points: 18420, level: 12, isCurrentUser: true },
    { rank: 5, name: "David Osei", avatarUrl: "", points: 17650, level: 12 },
  ],

  challenges: [
    { id: "chl_1", type: "weekly", title: "Complete 15 Tasks", progress: 9, target: 15, reward: 50, endsIn: "3d 4h" },
    { id: "chl_2", type: "monthly", title: "Earn 2,000 Points", progress: 1240, target: 2000, reward: 300, endsIn: "18d" },
    { id: "chl_3", type: "seasonal", title: "Summer Streak Marathon", progress: 9, target: 30, reward: 500, endsIn: "21d" },
  ],

  achievements: [
    { id: "ach_1", name: "First Steps", desc: "Complete your first task", icon: "footprints", unlocked: true },
    { id: "ach_2", name: "Streak Master", desc: "7-day login streak", icon: "flame", unlocked: true },
    { id: "ach_3", name: "Top Referrer", desc: "Refer 20+ friends", icon: "users", unlocked: true },
    { id: "ach_4", name: "Campaign Creator", desc: "Launch your first campaign", icon: "megaphone", unlocked: true },
    { id: "ach_5", name: "Century Club", desc: "Complete 100 tasks", icon: "trophy", unlocked: false, progress: 68, target: 100 },
    { id: "ach_6", name: "Big Spender", desc: "Spend 10,000 points on campaigns", icon: "gem", unlocked: false, progress: 4200, target: 10000 },
  ],

  countries: ["Nigeria", "Ghana", "Kenya", "South Africa", "United States", "United Kingdom", "India", "Philippines", "Brazil", "Egypt"],
  businessCategories: ["Fashion", "Beauty", "Technology", "Music", "Finance", "Gaming", "Health", "Food & Beverage", "Nonprofit", "Education", "Travel", "Real Estate"],

  adminUsers: [
    { id: "usr_001", name: "Ada Okafor", email: "ada.okafor@example.com", country: "Nigeria", status: "active", points: 18420, joined: "2025-11-02", level: 12 },
    { id: "usr_002", name: "Kemi Adisa", email: "kemi.a@example.com", country: "Ghana", status: "active", points: 42800, joined: "2025-08-14", level: 21 },
    { id: "usr_003", name: "Ibrahim Musa", email: "ibrahim.musa@example.com", country: "Nigeria", status: "suspended", points: 39120, joined: "2025-09-01", level: 19 },
    { id: "usr_004", name: "Zainab Yusuf", email: "zainab.y@example.com", country: "Kenya", status: "active", points: 35990, joined: "2025-07-22", level: 18 },
    { id: "usr_005", name: "David Osei", email: "david.osei@example.com", country: "Ghana", status: "banned", points: 17650, joined: "2025-12-10", level: 12 },
    { id: "usr_006", name: "Sarah Johnson", email: "sarah.j@example.com", country: "United States", status: "active", points: 9210, joined: "2026-01-18", level: 8 },
    { id: "usr_007", name: "Priya Patel", email: "priya.patel@example.com", country: "India", status: "active", points: 15400, joined: "2025-10-05", level: 11 },
  ],

  adminSubmissionsQueue: [
    { id: "sub_9001", user: "Chinedu Eze", task: "Follow @nova.skincare on Instagram", platform: "instagram", points: 1, submittedAt: "2026-07-07T10:12:00", screenshot: "" },
    { id: "sub_9002", user: "Grace Eze", task: 'Stream "Midnight Drive" 3x', platform: "spotify", points: 4, submittedAt: "2026-07-07T09:44:00", screenshot: "" },
    { id: "sub_9003", user: "Tunde Adeyemi", task: "Install Pulse Fitness and create an account", platform: "application", points: 10, submittedAt: "2026-07-07T08:59:00", screenshot: "" },
    { id: "sub_9004", user: "Fatima Ibrahim", task: "Join the Aurora Trading channel", platform: "telegram", points: 2, submittedAt: "2026-07-06T22:00:00", screenshot: "" },
  ],

  adminLogs: [
    { id: "log_1", admin: "Marcus Chen", action: "Approved task submission #sub_5001", time: "2026-07-06T15:00:00" },
    { id: "log_2", admin: "Marcus Chen", action: "Rejected task submission #sub_5003: username mismatch", time: "2026-07-05T18:22:00" },
    { id: "log_3", admin: "Marcus Chen", action: "Updated reward rule: App Install → 7 points", time: "2026-07-04T11:30:00" },
    { id: "log_4", admin: "Marcus Chen", action: "Suspended user Ibrahim Musa (policy violation)", time: "2026-07-02T14:12:00" },
    { id: "log_5", admin: "Marcus Chen", action: 'Uploaded new featured video: "Platform Update 2.4"', time: "2026-07-01T09:00:00" },
  ],

  revenueSeries: [4200, 4800, 5100, 4700, 6200, 7100, 6800, 7600, 8100, 8900, 9400, 10250],
  monthLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

  countryAnalytics: [
    { country: "Nigeria", users: 12400, revenue: 28400 },
    { country: "Ghana", users: 6200, revenue: 14100 },
    { country: "Kenya", users: 5100, revenue: 11200 },
    { country: "United States", users: 4200, revenue: 32100 },
    { country: "India", users: 8900, revenue: 15600 },
    { country: "Philippines", users: 3800, revenue: 8200 },
  ],

  videoAdSubmissions: [
    { id: "vad_001", brand: "Orbit Studio", videoUrl: "https://orbitstudio.io/ads/launch.mp4", category: "Technology", country: "Global", status: "active", submittedAt: "2026-07-01", paymentMethod: "cash", cost: 5, impressionsTotal: 5000, impressionsRemaining: 3120 },
    { id: "vad_002", brand: "Nova Skincare", videoUrl: "https://novaskincare.com/ads/glow.mp4", category: "Beauty", country: "Global", status: "active", submittedAt: "2026-07-03", paymentMethod: "points", cost: 150, impressionsTotal: 5000, impressionsRemaining: 4460 },
    { id: "vad_003", brand: "Kairo Beats", videoUrl: "https://kairobeats.com/ads/single.mp4", category: "Music", country: "Nigeria", status: "pending", submittedAt: "2026-07-06", paymentMethod: "points", cost: 150, impressionsTotal: 5000, impressionsRemaining: 5000 },
  ],

  platformPerformance: { uptime: 99.97, avgResponseMs: 128, activeUsersNow: 3240, tasksCompletedToday: 18240, pendingReviews: 96 },

  platformSettings: { referralReward: 20, xpPerLevel: 5000, adFrequencyMinutes: 5, adReward: 5 },
};
