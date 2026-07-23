# Reward-Based Social Promotion Platform

## Project Overview

Build a modern, responsive web application that allows users to complete promotional tasks in exchange for virtual points. Those points can then be used to purchase promotional campaigns across multiple social media platforms, websites, applications, and music services.

The platform operates as a closed-loop reward economy where users can either earn points by completing tasks or purchase promotional campaigns directly with cash.

The application must be secure, scalable, mobile-friendly, and built using:

## Frontend

- HTML5 — hand-written, semantic markup
- Hand-written CSS — no framework, no Tailwind; a design-token system drives the look
- Vanilla JavaScript — no build step, no framework, no bundler
- Lucide Icons (via CDN)
- Google Fonts — Anton / Archivo / Inter (via CDN)

The entire app is plain HTML/CSS/JS so both markup and styling can be edited by hand. There is no build step and no external package dependency beyond the two CDNs above.

## Backend

- Supabase
  - Authentication
  - PostgreSQL Database
  - Storage
  - Realtime
  - Edge Functions where necessary

---

# Frontend Architecture

The frontend lives in the **`vanilla/`** folder — plain HTML, hand-written CSS, and vanilla JavaScript. No Tailwind, no build step, no framework.

**Run it:** `node vanilla/serve.cjs` (a tiny static file server), then open `http://localhost:5500/<page>.html` (root `/` serves `landing.html`). No install or build. Requires internet for two CDNs only: Lucide icons and Google Fonts (Anton/Archivo/Inter).

**Styling:**
- `vanilla/css/theme.css` — design tokens only (the "Collider" system: colors, fonts, `--radius`, shadows, z-index). **Edit values here to restyle globally.**
- `vanilla/css/base.css` — a CSS reset (box-sizing, margin zeroing, etc.) so spacing is consistent across browsers.
- `vanilla/css/components.css` — reusable component classes: `.btn` (`--primary/--outline/--secondary/--ghost` × `--sm/--lg`), `.badge` (`--success/--warning/--info/--destructive/--outline/--secondary`), `.card` (`--pad/--pad-lg/--flush`), `.progress`/`.progress__bar`, `.avatar` (`--sm/--lg`) + `.avatar__fallback`, `.stars`, `.wordmark`, `.ember-gradient`, `.toast`, `.reveal` (scroll-in animation), plus `.page-header`, form controls (`.input`/`.select`/`.textarea`/`.input-group`/`.field`), `.empty-state`, `.dialog` (JS-toggled `.is-open`; `[data-open-dialog]` / `[data-dialog-close]`; Esc closes), `.tabs__list`/`.tabs__trigger`, `.table`/`.table-wrap`, `.pick`, `.pay-option`/`.pay-grid`, `.stat-grid`/`.stat-card__*`, `.section-title`, `.btn--icon`, `.input--mono`, `.switch`, `.chip`, `.checkbox`, `.social-row`.
- `vanilla/css/app.css` — the signed-in shell chrome: `.sidebar` (+ `.is-collapsed`), `.app-header`, `.profile-menu`, `.app-sheet` (mobile), `.app-footer-nav`, `.ad-overlay`/`.ad-modal`.
- One CSS file per page for layout (e.g. `landing.css`, `dashboard.css`), scoped with a page prefix (`.lp-*`, `.dash-*`). Responsive breakpoints use media queries (sm=640, md=768, lg=1024, xl=1280px).

**JavaScript:**
- `vanilla/js/data.js` — seed/content data (`window.EARNLOOP_SEED`). This is the editable "content."
- `vanilla/js/store.js` — a `localStorage`-backed store (`EL.store.get/dispatch/subscribe/reset`), plus formatting helpers (`EL.formatNumber`, `EL.timeAgo`, `EL.initials`, …), `EL.platformIcon()` (brand SVGs + Lucide fallbacks), and `EL.toast` (toast notifications). State persists across pages/reloads.
- `vanilla/js/shell.js` — injects the sidebar/header/footer-nav/video-ad-overlay around any page that has `<main data-app-main data-active="<page-id>">`. The video-ad overlay fires every `adFrequencyMinutes`, unlocks skip at a random point between 30–60s, and awards `adReward` points.
- Per-page JS (e.g. `dashboard.js`, `landing.js`) binds data into the HTML and handles page interactions (count-ups, accordions, scroll reveals). Lucide icons render via `lucide.createIcons()`; brand icons (Instagram/Spotify/etc.) are inline SVGs.

**Page structure convention:** each signed-in page is `<main data-app-main data-active="…">` + placeholders filled by its page JS, with `<script>`s loaded in order `data.js → store.js → <page>.js → shell.js`.

---

# Implementation Status

The frontend is functional end-to-end against **mock/seed data only** — no Supabase project is wired up yet. State lives in the `localStorage`-backed store (`vanilla/js/store.js`), seeded from `vanilla/js/data.js`.

**Pages built** (all in `vanilla/`):
- App pages (carry `<main data-app-main data-active="…">`, chrome injected by `shell.js`): Dashboard, Tasks, My Tasks, Create Campaign (includes a full pricing engine), Video Ads, Referral, Wallet, Notifications, Account Settings, Profile.
- Standalone pages (own layout, no app shell): Landing, Auth (`auth.html`, login/register + email-OTP), Onboarding (`onboarding.html`, 3-step), Admin Dashboard (`admin-dashboard.html` — standalone admin shell with 7 hash-routed sections: `#overview`, `#users`, `#review`, `#tasks`, `#campaigns`, `#content`, `#logs`).

**Video Ads system** (`vanilla/video-ads.html`, overlay in `vanilla/js/shell.js`):
- Users post a video ad by picking a file from their device gallery (`<input type="file" accept="video/*">` + local preview). The file uploads to the `ad-videos` Storage bucket and the overlay plays it.
- Pricing: cash is a flexible budget (any amount ≥ $1, at $1 per 1,000 views, view count syncs live as the amount is typed) or a fixed package of 150 points for 5,000 views.
- A global overlay shows a live ad every `adFrequencyMinutes` minutes (admin-configurable, default 5) while signed in; skip unlocks at a random point between 30–60s; finishing (skip or natural end) awards `adReward` points.
- Each impression decrements the ad's remaining-view counter; the ad is removed automatically once it hits 0.
- Footer nav shows `Video Ads` in place of `Tasks` (still present in the sidebar and admin nav).

**Backend status:** Supabase auth (email + Google OAuth), the PostgreSQL schema with RLS, Storage (screenshots + ad videos), and the secure server-side functions are wired up — see `docs/PROJECT-PROGRESS.md` for exactly which pages read live data and which SQL files to run.

**Not yet implemented:** AI screenshot validation, gamification (challenges/achievements), the dashboard featured video, real deposits (Add Funds), and server-side campaign price validation — still simulated with mock data and client-only state.

---

# User Types

Implement two user roles.

## 1. User

Users can:

- Register
- Login
- Verify email using OTP
- Sign in with Google
- Edit profile
- Complete promotional tasks
- Upload screenshot proof
- Earn points
- Spend points
- Create campaigns
- Purchase campaigns with cash
- View earnings
- Track campaign progress
- Join weekly and monthly challenges
- Participate in seasonal events
- Invite friends
- Receive referral rewards
- View analytics
- Increase XP and Levels

---

## 2. Admin

Admin has complete control of the platform.

Admin can:

- View every user
- Ban or suspend users
- Delete users
- Approve screenshot proofs
- Reject screenshot proofs
- Create task categories
- Create unlimited platform tasks
- Edit all point rewards
- Edit campaign pricing
- Configure referral rewards
- Configure XP system
- Upload featured videos
- Upload advertisements
- Manage notifications
- View platform analytics
- View revenue analytics
- View country analytics
- View platform performance
- Control advertisement frequency

---

# User Onboarding

When a new user signs up:

### Step 1

Register

### Step 2

Verify Email using OTP

### Step 3

Google Authentication (optional)

### Step 4

Complete Profile

Collect:

- Country
- Business Categories (multiple selection)
- Social Accounts

Supported social accounts:

- Instagram
- Facebook
- TikTok
- X
- LinkedIn

### Step 5

Open Dashboard

---

# Dashboard

Display the following information.

## Profile Card

Display:

- Profile Photo
- Username
- Current Level
- Current XP
- Point Balance

## Statistics

Display:

- Recent Earnings
- Task Progress
- Daily Streak
- Leaderboard Rank

## Analytics

Display:

- Campaign Statistics
- Animated Charts
- Performance Overview

## Notifications

Include:

- Notification Center
- Notification Sounds
- Read / Unread Status

## Appearance

Support:

- Light Mode
- Dark Mode

---

# Navigation

## Header

**Left**

- Business Logo
- Platform Name

**Right**

- Profile Avatar
- Notification Icon

## Sidebar

Include:

- Dashboard
- Post Task
- My Tasks
- Referral
- Account Settings
- Logout

## Footer Navigation

Include:

- Dashboard
- Video Ads
- Settings

---

# Task System

Users complete promotional tasks to earn points.

Tasks cannot be skipped.

### Task Flow

User selects task

↓

Task opens

↓

User completes action

↓

Uploads screenshot

↓

AI validation

↓

Admin review (optional)

↓

Reward points

---

# Screenshot Validation

The system should verify:

- Screenshot timestamp
- Username
- Platform
- Correct task

If validation fails:

- Reject task
- Require resubmission
- Never award points

---

# Supported Task Types

### Instagram

- Follow
- Like
- Comment
- Share
- Save
- Use Audio

### Facebook

- Follow
- Like
- Comment
- Share

### TikTok

- Follow
- Like
- Comment
- Share
- Save
- Use Sound

### YouTube

- Subscribe
- Like
- Comment
- Share
- Watch

### X (Twitter)

- Follow
- Like
- Comment
- Bookmark
- Repost

### LinkedIn

- Follow
- Like
- Comment
- Share

### Pinterest

- Follow
- Like
- Comment
- Share

### Telegram

- Join Group
- Join Channel
- Start Bot

### WhatsApp

- View Status
- Join Group
- Follow Channel

### Discord

- Join Server

### Spotify

- Stream
- Follow
- Download

### BoomPlay

- Stream
- Follow
- Comment
- Download

### Audiomack

- Stream
- Follow
- Comment
- Download

### Apple Music

- Stream
- Follow
- Download

### Amazon Music

- Stream
- Follow
- Download

### Website

- Visit
- Timer Verification

### Application

- Install
- Install + Registration

---

# Point Reward System

| Action | Reward |
|---------|--------|
| Follow | 1 Point |
| Like | 1 Point |
| Comment | 2 Points |
| Share | 2 Points |
| Website Visit (30 sec) | 2 Points |
| Website Visit (60 sec) | 4 Points |
| Website Visit (2 min) | 5 Points |
| Music Stream | 4 Points |
| Join Group | 2 Points |
| Join Channel | 2 Points |
| Follow Channel | 2 Points |
| Watch Video Ad | 5 Points |
| App Install | 7 Points |
| Install + Registration | 10 Points |
| Email Subscription | 2 Points |
| Product Review | 5 Points |

**Admin can modify every reward.**

---

# Campaign System

Users may purchase campaigns using:

- Points
- Cash

## Social Media

- Followers
- Likes
- Comments
- Shares
- Views

Supported Platforms:

- Instagram
- TikTok
- Facebook
- YouTube
- X (Twitter)
- LinkedIn
- Pinterest

## Website

- Visits
- Traffic
- Clicks
- Newsletter Signup
- Form Submission

## Applications

- Downloads
- Install
- Registration
- Reviews

## Music

- Streams
- Playlist Adds
- Followers
- Likes

---

# Campaign Targeting

Advertisers choose:

- Country
- Business Category
- Platform
- Task Type

Only matching users should receive tasks.

---

# Pricing Engine

Implement automatic pricing.

### Instagram Followers

- 1,000 = $2.50
- 5,000 = $12
- 10,000 = $22

### Website Visits

- 30 Seconds = $0.05
- 60 Seconds = $0.10
- 2 Minutes = $0.25

### Music Streams

- $0.008 per stream
- Minimum 10,000 streams

The system must automatically calculate the total cost based on the selected quantity.

---

# Referral System

Workflow:

Invite Friend

↓

Friend Registers

↓

Friend Completes Required Tasks

↓

Reward Referrer

Default Reward:

- 20 Points

Admin can change this value.

---

# Gamification

Implement:

- Daily Login Bonus
- Daily Streak
- XP Levels
- Badges
- Achievements
- Weekly Challenges
- Monthly Challenges
- Seasonal Events
- Leaderboards

---

# Video Advertisement System

Implement non-skippable video advertisements.

Rules:

- Display every five minutes while users are completing tasks.
- After a successful watch, award **5 Points**.
- Revenue Model: CPM

---

# Featured Video

The dashboard should include a **Featured Video** section.

Only the Admin can upload videos.

Purpose:

- Sponsored Products
- Platform Announcements
- Premium Advertisements

---

# Security

Implement:

- Supabase Row Level Security (RLS)
- JWT Authentication
- Email Verification
- Google OAuth
- Secure File Upload
- Screenshot Validation
- Rate Limiting
- Input Validation
- CSRF Protection
- XSS Protection
- SQL Injection Prevention
- Audit Logging for all Admin actions

---

# Database Design

Create normalized Supabase tables for:

- Users
- Profiles
- Social Accounts
- Tasks
- Task Categories
- Task Submissions
- Campaigns
- Campaign Orders
- Reward Rules
- Point Transactions
- XP Transactions
- Notifications
- Video Ads
- Featured Videos
- Referrals
- Challenges
- Achievements
- Leaderboards
- Settings
- Countries
- Business Categories
- Analytics
- Admin Logs

---

# Technical Requirements

You should:

- Use a clean, modular architecture.
- Separate frontend, backend, and business logic.
- Make every configurable value editable through the Admin Panel (points, pricing, referral rewards, advertisement frequency, etc.).
- Ensure the application is fully responsive across desktop, tablet, and mobile devices.
- Use Supabase Authentication, PostgreSQL, Storage, Realtime, and Edge Functions where appropriate.
- Optimize for speed, scalability, accessibility, and security.
- Build reusable UI components.
- Maintain a scalable project structure.
- Write clean, maintainable, and well-documented JavaScript code.
- Design the system so that adding new platforms, task types, reward rules, and campaign categories requires minimal code changes.

---

# Design Direction

You are a senior product designer and frontend engineer responsible for creating a world-class AI SaaS interface.

Design a premium, production-ready application inspired by the design philosophy and visual quality of modern products such as Base44, Linear, Vercel, Notion, Cursor, Raycast, and Stripe.

**Do not copy any layouts, components, branding, assets, or visual identities from these products.** Instead, capture the same level of craftsmanship, polish, usability, consistency, and attention to detail that makes them feel exceptional.

## Core Principles

The interface should feel:

- Modern
- Premium
- Minimal
- Fast
- Intelligent
- Professional
- Clean
- Spacious
- Elegant
- Production-ready

Every pixel should have a purpose. Favor clarity over decoration, simplicity over complexity, and consistency over novelty.

## Visual Language

Create a clean, neutral, and timeless design system.

Use:

- Beautiful typography
- Generous whitespace
- Soft shadows
- Rounded corners
- Balanced layouts
- Subtle depth
- Smooth animations
- Excellent visual hierarchy
- Consistent spacing
- Responsive layouts

Avoid:

- Glassmorphism
- Neumorphism
- Heavy gradients
- Excessive shadows
- Loud colors
- Visual clutter
- Thick borders
- Distracting animations
- Overly decorative UI

## Typography

Use **Inter** as the primary font with a clear and consistent hierarchy.

Typography should be highly readable, well-balanced, and comfortable across all screen sizes. Use thoughtful font weights and spacing to create hierarchy rather than relying on excessive colors or oversized text.

## Layout & Spacing

Use a consistent 8px spacing system throughout the application.

Design layouts with generous whitespace, clean alignment, and excellent content hierarchy. Every screen should feel open, organized, and effortless to scan.

## Components

Every UI component should feel production-ready.

Buttons, inputs, cards, tables, modals, navigation, dropdowns, forms, empty states, skeleton loaders, notifications, and dialogs should all share one cohesive design language with consistent spacing, border radius, shadows, and interactions.

## Motion

Use subtle, purposeful animations.

Use CSS transitions/animations and small vanilla-JavaScript helpers for page transitions and micro-interactions. Animations should enhance usability, not distract from it.

## User Experience

Reduce cognitive load.

The application should feel intuitive, responsive, and fast. Every interaction should be predictable and refined.

Prioritize accessibility, usability, and performance over visual effects.

## Frontend Stack

Use:

- HTML5 (semantic, hand-written markup)
- Hand-written CSS (no framework, no Tailwind)
- Vanilla JavaScript (no build step, no framework)
- Lucide Icons (via CDN)
- Reusable component classes and a shared design-token system

Create reusable design tokens for:

- Colors
- Typography
- Spacing
- Border radius
- Shadows
- Animations
- Breakpoints

Use these tokens throughout the application to ensure complete consistency.

## Quality Standard

The final product should look like a premium enterprise AI platform designed by an elite product team.

Every screen should demonstrate exceptional typography, balanced whitespace, polished interactions, subtle animations, excellent usability, and a cohesive design system that scales as the application grows.

The result should feel comparable in quality to modern SaaS products such as Base44, Linear, Vercel, Notion, Cursor, Raycast, and Stripe—not by copying them, but by achieving the same level of refinement, consistency, and user experience.
