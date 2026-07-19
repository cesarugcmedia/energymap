# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App Overview

**AmpedMap** is a crowdsourced energy drink tracking app. Users report what energy drinks are in stock at stores near them; others see that data on a live map. The core loop: find a store → submit a stock report → map updates in near-real-time.

Live at: `https://ampedmap.com`

## Commands

```bash
npm run dev      # Start dev server (Next.js + Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint via Next.js
```

No test runner is configured.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Styling | Tailwind CSS + CSS custom properties |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Maps | Mapbox GL 3 + Supercluster (clustering) |
| Geocoding | US Census API (primary), Nominatim (fallback) |
| Payments | Stripe (subscriptions) |
| Email | Resend |
| Deployment | Vercel |

## Architecture

### Routing & Middleware

All routing uses Next.js App Router. `src/middleware.ts` optionally gates the entire app behind a waitlist when `MIDDLEWARE_WAITLIST_ACTIVE=true` (accepts `"true"` or `"1"`). The bypass cookie set after accepting an invite (`amped_invited`) is HMAC-signed via `src/lib/inviteToken.ts` using `INVITE_COOKIE_SECRET` — middleware verifies the signature rather than just checking the cookie's shape, so it can't be forged with an arbitrary UUID.

Key pages:
- `/` — Main map experience (the core feature)
- `/stores` — Filterable store list
- `/leaderboard` — Rankings via Supabase RPC
- `/submit` — Stock report submission
- `/add-store` — Store submission form
- `/account` — Profile, badge, stats, subscription management
- `/admin` — Admin dashboard (tier-gated)

### Auth & User State

`src/contexts/AuthContext.tsx` is the source of truth for auth state. It provides `user` (Supabase auth user) and `profile` (app-specific profile row) to the entire app. Profile fetching uses up to 4 retry attempts with exponential backoff.

All pages use `'use client'` — there are no React Server Components rendering auth-dependent UI. Auth sessions are managed entirely client-side via the Supabase JS SDK.

### Database Schema

Core tables in `public` schema:
- `profiles` — Extends `auth.users`; holds `username`, `tier`, `stripe_customer_id`, badges, stats, location
- `stores` — Store records with `lat`, `lng`, `status` (pending/approved/rejected)
- `stock_reports` — Individual drink-at-store reports submitted by users
- `latest_stock` — Materialized view of the most recent report per drink per store
- `drinks` — Drink catalog (name, brand, flavor, caffeine)
- `stock_confirmations` — Community votes on stock accuracy (`confirmed` boolean, unique per store+drink+user)
- `notifications` — User notifications (real-time via Supabase Realtime)
- `waitlist` — Pre-launch waitlist emails

**Supabase row cap**: The server-side `max_rows` is 1,000. Any query fetching all stores must paginate using `.range(from, from + BATCH - 1)` in a loop — never rely on `.limit()` alone.

Admin and webhook operations use the service role client (bypasses RLS). Regular client uses the anon key (subject to RLS policies).

### Tier System

| Tier | Features |
|---|---|
| `free` | 5-mile map radius, view stock, limited submissions |
| `tracker` | Unlimited radius, advanced analytics, badge system |
| `admin` | All tracker features + moderation |

Tier upgrades go through Stripe. The webhook at `/api/stripe/webhook` handles fulfillment by updating `profiles.tier` and `profiles.stripe_customer_id`.

### Maps

`src/components/MapView.tsx` renders a Mapbox GL map. Supercluster aggregates store markers client-side (radius: 60px, max zoom: 16). The user's live location shows as a pulsing dot. Store markers use emoji icons. Radius is enforced **server-side** in `/api/stores/nearby` (free/anon capped to 5 miles, tracker/admin unlimited) — the server determines tier from the caller's bearer token, so a free-tier client never receives out-of-radius stores over the wire.

`useNearbyStores` calls that route and caches the result in memory with a 60-second TTL, keyed by rounded lat/lng **and** a tier key (`'anon' | 'free' | 'tracker'`) passed in by the caller from `profile` — this is what makes it refetch correctly on login/logout/tier changes instead of showing stale data. The route itself paginates in 1,000-row batches server-side to work around Supabase's `max_rows` cap.

### API Routes

All routes live in `src/app/api/`. Each route:
1. Validates the request with `checkRateLimit()` from `src/lib/rateLimit.ts`
2. Uses the Supabase service role client for privileged operations
3. Returns JSON responses

Rate limiting is **in-memory per instance** (not distributed/Redis) — it resets on server restart and does not coordinate across Vercel function instances.

Key routes:
- `POST /api/stripe/checkout` — Creates Stripe checkout session
- `POST /api/stripe/webhook` — Handles Stripe events (subscription lifecycle)
- `POST /api/stripe/cancel` — Cancels subscription
- `POST /api/email/welcome` — Sends welcome email via Resend (internal calls from the Stripe webhook authenticate via `INTERNAL_API_SECRET`, not a user token)
- `POST /api/geocode` — Geocodes an address string to lat/lng
- `POST /api/stock/report` — Submits stock reports for a store; enforces the geofence, daily limit, and dedup window server-side (see Geofencing & Submission Limits below)
- `GET /api/stores/nearby` — Returns approved stores near `lat`/`lng`, tier-filtered server-side (5mi cap for free/anon, unlimited for tracker/admin)
- `POST /api/stock/confirm` — Upserts or deletes a community confirmation vote on a stock report
- `POST /api/admin/delete-user` — Admin user deletion
- `POST /api/invite` — Converts a waitlist entry to a full account

### Theming

The app is **dark mode only**. CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, `--fg-*` alpha series, etc.) drive all colors and are defined in `src/app/globals.css`. `ThemeContext.tsx` is a no-op stub kept for import compatibility.

### Badge System

18 badges defined in `BADGE_DEFS` in `src/app/account/page.tsx`. Most are computed client-side on page load from stats (report count, store count, unique drinks, streak, report timestamps). Two exceptions:
- `verified` — read from `profiles.is_verified_reporter` (admin-toggled)
- `weekly_champion` — read from `profiles.badges` (text[] column), assigned by the weekly cron function

The account page profile tab shows badges in earned-first order, 4 visible by default with a "Show more" toggle.

### Automations

Three Supabase automations in `scripts/automation-*.sql` — run each once in the Supabase SQL Editor to activate:

| Script | Trigger | Schedule |
|---|---|---|
| `automation-weekly-champion.sql` | Assigns 👑 badge + notification to top reporter | Every Monday 00:00 UTC (pg_cron) |
| `automation-badge-notifications.sql` | Fires in-app notification on report/drink/store milestones | DB trigger on `stock_reports` INSERT + `stores` UPDATE |
| `automation-stale-cleanup.sql` | Deletes non-latest reports older than 7 days | Every night 03:00 UTC (pg_cron) |

Requires pg_cron (enabled by default on Supabase Pro).

### Stock Report Accuracy

Stock reports on store pages show a freshness state based on age:
- **Fresh** — reported < 2h ago
- **Aging** — 2–12h ago
- **Stale** — 12–24h ago
- **Unverified** — > 24h ago (greyed out)

All users see the freshness label; `tracker` tier users additionally see the exact time ago.

Each drink card shows ✓/✗ community confirmation buttons. Votes are stored in `stock_confirmations` and displayed as counts. Optimistic UI updates on tap; tapping the same button again removes the vote.

### Geofencing & Submission Limits

Stock report submission (`/submit/drinks`) posts to `/api/stock/report`, which enforces everything **server-side** using the caller's bearer token (the client's own Haversine check is just a UX hint — a status message shown before submitting — not the actual enforcement):
- **500m geofence** around the target store. If GPS is unavailable, the check is skipped and submission is still allowed. Admins bypass it entirely.
- **25 reports/day limit** — applies to both `free` and `tracker` tiers; only admins are unlimited.
- **30-minute same-drink dedup** — applies to `free` tier only; `tracker`/admin can re-report the same drink at the same store without waiting.

A submission where every pick was deduped returns `{ submitted: 0 }`; the client shows an "already reported" message rather than the success screen in that case.

### Location (iOS Safari)

`src/hooks/useLocation.ts` checks the Permissions API before auto-requesting geolocation. If permission is already `granted`, it requests immediately on mount. Otherwise it waits for a user tap (required for iOS Safari). The initial map screen shows an "Enable Location" button to trigger the first request via user gesture.

### PWA

Manifest generated at `src/app/manifest.ts`. Service worker registered via `src/components/ServiceWorkerRegister.tsx`. Offline fallback page at `/offline`.

## App Store Roadmap

The goal is to ship AmpedMap on the iOS App Store using **Capacitor** (Ionic) to wrap the existing Next.js web app in a native iOS shell — no rewrite required.

### Phase 1: Prerequisites
- Enroll in the **Apple Developer Program** at developer.apple.com ($99/year — allow a few days for approval)
- A **Mac with Xcode** is required to build and submit. Alternative: cloud Mac via MacStadium, Codemagic, or GitHub Actions macOS runners.
- Publish a **Privacy Policy** page at a live URL (e.g. `ampedmap.com/privacy`) — required because the app collects location data.

### Phase 2: Capacitor Setup
1. Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`
2. Configure `capacitor.config.ts` to point WebView at `https://ampedmap.com`
3. Run `npx cap add ios` to generate the Xcode project
4. Add native plugins:
   - `@capacitor/push-notifications` — nearby stock alerts (also prevents "web wrapper" rejection)
   - `@capacitor/geolocation` — more reliable GPS than browser on iOS
   - `@capacitor/haptics` — tap feedback
   - `@capacitor/splash-screen` — required splash screen
   - `@capacitor/status-bar` — match dark theme

### Phase 3: iOS Polish
- Verify safe area insets on notch/Dynamic Island/home indicator devices
- App icon: 1024×1024 PNG, no transparency, no rounded corners
- Splash screen asset
- `NSLocationWhenInUseUsageDescription` — clear description in `Info.plist`
- Test keyboard behavior on search/form inputs
- Verify iOS swipe-back doesn't conflict with map gestures

### Phase 4: App Store Assets (App Store Connect)
- App name: "AmpedMap" (verify availability)
- Bundle ID: e.g. `com.ampedmap.app`
- Screenshots: required for iPhone 6.9" (iPhone 16 Pro Max) and 6.5" sizes minimum
- App description + keywords
- Age rating questionnaire (likely 4+)
- Category: Food & Drink or Navigation

### Phase 5: Build & TestFlight
1. Set Team, Bundle ID, and signing in Xcode
2. `Product → Archive` → upload via Xcode Organizer
3. Distribute to TestFlight for real-device testing before public release

### Phase 6: Submit for Review
- Fill all metadata in App Store Connect
- Apple review typically takes 1–3 days
- Key rejection risks: missing privacy policy, vague location permission string, no native features beyond WebView (push notifications mitigates this)

### Priority Order
| Step | Effort |
|---|---|
| Apple Developer enrollment | 30 min + approval wait |
| Privacy policy page | 1–2 hours |
| Capacitor setup | 2–4 hours |
| App icon + splash screen | 1–2 hours |
| Push notifications | 3–5 hours |
| iOS polish + device testing | 2–4 hours |
| Screenshots + metadata | 1–2 hours |
| TestFlight + submission | 1 hour |

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_APP_URL
STRIPE_SECRET_KEY
STRIPE_PRICE_TRACKER          # Stripe price ID for tracker tier
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
MIDDLEWARE_WAITLIST_ACTIVE     # Optional — set to "true" to enable waitlist gating
ADMIN_BYPASS_SECRET            # Optional — cookie value for admin bypass
INVITE_COOKIE_SECRET           # Required when waitlist gating is active — HMAC key signing the invite-accept bypass cookie
INTERNAL_API_SECRET            # Required — shared secret for server-to-server calls (e.g. Stripe webhook → /api/email/welcome)
```
