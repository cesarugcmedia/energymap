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
- `/` — Main map experience (the core feature). Has a Map View / List View toggle in the header — List View is the filterable/searchable store list (formerly the separate `/stores` route, which now just redirects here)
- `/leaderboard` — Rankings via Supabase RPC
- `/community` — Social feed: text posts optionally tagged to a store and/or a photo, likes, comments, follow system with a Following filter, Trending/Recent/Following sort, trending-stores widget
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
- `stores` — Store records with `lat`, `lng`, `status` (pending/approved/rejected), `state` (nullable — see "NC/FL Focus" below)
- `stock_reports` — Individual drink-at-store reports submitted by users
- `latest_stock` — Materialized view of the most recent report per drink per store
- `drinks` — Drink catalog (name, brand, flavor, caffeine)
- `stock_confirmations` — Community votes on stock accuracy (`confirmed` boolean, unique per store+drink+user)
- `notifications` — User notifications (real-time via Supabase Realtime)
- `waitlist` — Pre-launch waitlist emails
- `community_posts` / `community_post_likes` / `community_post_comments` — `/community` feed posts (optionally tagged to a store via `store_id` and/or a photo via `photo_url`), their likes (unique per post+user), and flat (non-threaded) comments. Defined in `scripts/create-community-tables.sql` and `scripts/create-community-v2-tables.sql` — neither has been run against production as of this writing; run both once in the Supabase SQL Editor (in that order) to activate the feature
- `follows` — `follower_id`/`followed_id` pairs powering the Community "Following" filter; no follower/following counts are surfaced anywhere yet, just the filter. Also defined in `scripts/create-community-v2-tables.sql`
- `kroger_stock` — Kroger-verified availability per store+drink (`in_stock`, `price`, `checked_at`), kept separate from `stock_reports`/`latest_stock` rather than inserted as synthetic user reports. `stores.kroger_location_id` and `drinks.kroger_upc` (both nullable) hold the match to a real Kroger location/product. Defined in `scripts/create-kroger-integration-tables.sql` — not yet run against production. See "Kroger Integration" below.

**Storage**: `community-photos` bucket (public read, created by `create-community-v2-tables.sql`) holds `/community` post photos, uploaded client-side to a `<user_id>/...` path enforced by storage RLS. `/api/community/post` only accepts a `photo_url` that matches the caller's own bucket path — never an arbitrary external URL.

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

### NC/FL Focus

The public map, store list, "Stores Tracked" stat, and the Community store-tag search are all scoped to North Carolina and Florida for now — data outside those states isn't deleted, just filtered out of what's shown. Filtering is **fail-open**: a store only gets hidden once `stores.state` is confirmed to be something other than `'North Carolina'`/`'Florida'`; a store with `state IS NULL` (not tagged yet) still shows everywhere. This is deliberate — it means rolling this out, or re-running the tagging script, never makes the live map go blank mid-way.

- `scripts/add-store-state-column.sql` — adds the nullable `stores.state` column (run first)
- `scripts/tag-store-states.mjs` — one-time (resumable) reverse-geocoding pass via Nominatim that fills in `state` for every approved store; only tags data, never hides anything itself
- The actual filtering lives in three places: `/api/stores/nearby`, `/api/stats`, and the store-tag search in `src/app/community/page.tsx`. The admin dashboard is intentionally **not** filtered — admins still see/manage every store regardless of state.

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
- `POST /api/community/post` — Creates a `/community` feed post (1–500 chars, optional `store_id` tag and/or `photo_url`), rate-limited to 10/hour
- `POST /api/community/like` — Upserts or deletes a like on a `/community` post
- `POST /api/community/comment` — Adds a flat (non-threaded) comment to a `/community` post (1–300 chars), rate-limited to 20/hour
- `POST /api/community/follow` — Upserts or deletes a `follows` row between the caller and another user
- `POST /api/admin/delete-user` — Admin user deletion
- `POST /api/admin/kroger-sync` — Admin-triggered (not scheduled yet); refreshes `kroger_stock` for every matched store×drink pair. See "Kroger Integration" below
- `GET /api/admin/kroger-search-locations` / `POST /api/admin/kroger-match-store` — searches Kroger locations near a store's zip code, and sets/clears `stores.kroger_location_id`
- `GET /api/admin/kroger-search-products` / `POST /api/admin/kroger-match-drink` — searches Kroger's product catalog by term (scoped to a matched store's location), and sets/clears `drinks.kroger_upc`
- `POST /api/admin/kroger-import-locations` — pulls Kroger's own locations near a zip code; auto-links to an existing store within ~150m or creates a new one otherwise
- `POST /api/invite` — Converts a waitlist entry to a full account

### Kroger Integration

Supplements crowdsourced stock reports with official availability data from Kroger's Products API — kept as a visually distinct "✅ Kroger: In/Out of Stock" badge on the store page rather than merged into `stock_reports`, so it never gets conflated with a user's own report.

- `src/lib/kroger.ts` — server-only client-credentials OAuth wrapper (`KROGER_CLIENT_ID`/`KROGER_CLIENT_SECRET`) plus thin Locations/Products API calls. Only the **Products** and **Locations** API products are needed — no customer-login scopes (Cart/Order/Profile), since this never acts on a real shopper's account.
- **Not yet exercised against a live Kroger account** — written against their published API shape, but exact query-param names should be re-verified against `developer.kroger.com` on the first real sync; Kroger tends to return `200` with an empty result on a param mismatch rather than an error, so a silent no-op is the likely failure mode.
- Matching happens in `/admin`'s **Kroger** tab: search suggests candidate Kroger locations (by the store's zip code) or products (by free-text term, scoped to an already-matched store's location) and an admin picks the right one — it's a suggest-and-confirm flow, not automatic matching, since only a human can confirm two listings are really the same place/product. `POST /api/admin/kroger-sync` then walks every matched store × matched drink pair and upserts `kroger_stock`. No scheduled/automatic sync yet — admin-triggered only until the whole flow has been validated against real data.
- **Bulk import**: rather than manually matching one store at a time, "Import Kroger Locations" pulls every Kroger location near a zip code and, per location, either links it to an existing store within ~150m (avoids duplicate pins for a store that's already crowdsourced) or creates a new `stores` row for it (`type: 'grocery'`, `status: 'approved'`, `state` left `NULL` so it gets picked up by the normal `tag-store-states.mjs` pass same as any other store). This is additive only — it never removes or replaces non-Kroger stores, since Kroger doesn't meaningfully operate in Florida and the app covers more retailers than just Kroger.

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
KROGER_CLIENT_ID               # Optional — required only for the Kroger integration (src/lib/kroger.ts)
KROGER_CLIENT_SECRET           # Optional — required only for the Kroger integration (src/lib/kroger.ts)
```
