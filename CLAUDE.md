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
- `/community` — Social feed **and** rankings, merged into one tab via a Feed / Leaderboard sub-toggle under the header (formerly the separate `/leaderboard` route, which now just redirects here with `?view=leaderboard` — same pattern as the `/stores` merge). Feed: text posts optionally tagged to a store and/or a photo, likes, comments, follow system with a Following filter, Trending/Recent/Following sort, trending-stores widget. Leaderboard: rankings via the `get_leaderboard` Supabase RPC, fetched lazily only once that sub-tab is opened.
- `/notifications` — "Alerts" tab; every notification type in one list (badge unlocks, comment replies, drink-alert restocks, admin store approvals, etc.) — see "Notifications & Nav Icons" below
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
- `community_posts` / `community_post_likes` / `community_post_comments` — `/community` feed posts (optionally tagged to a store via `store_id` and/or a photo via `photo_url`), their likes (unique per post+user), and flat (non-threaded) comments. Defined in `scripts/create-community-tables.sql` and `scripts/create-community-v2-tables.sql` — neither has been run against production as of this writing; run both once in the Supabase SQL Editor (in that order) to activate the feature
- `follows` — `follower_id`/`followed_id` pairs powering the Community "Following" filter; no follower/following counts are surfaced anywhere yet, just the filter. Also defined in `scripts/create-community-v2-tables.sql`
- `kroger_stock` — Kroger-verified availability per store+drink (`in_stock`, `price`, `checked_at`), kept separate from `stock_reports`/`latest_stock` rather than inserted as synthetic user reports. `stores.kroger_location_id` and `drinks.kroger_upc` (both nullable) hold the match to a real Kroger location/product. Defined in `scripts/create-kroger-integration-tables.sql` — **confirmed run against production** (verified via `information_schema` query, not just assumed — see the note in "Kroger Integration" below about why that distinction matters here). See "Kroger Integration" below.

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

Clusters and individual store markers are **freshness-coded**: `src/app/page.tsx` collapses each store's most recent report age to a binary `'fresh' | 'stale'` signal (< 12h = fresh, mirroring the store page's Fresh/Aging buckets; no reports at all also reads as stale) and passes it into `MapView` as `storeFreshness`. A cluster aggregates its members via Supercluster's `getLeaves()` — all-fresh renders lime, all-stale renders gray, a mix renders amber — so density-grouped pins don't lose the "worth a trip vs. probably dead data" signal once stores get bucketed together. An always-visible legend (bottom-left) explains the three colors; there's no toggle for it since the colors need explaining at a glance, not on request.

Map View also carries its own search box + store-type filter chips in the header (mirroring List View's), and both actually filter what's plotted — `MapView` is fed the same already-filtered `sorted` list List View uses, not the raw unfiltered `stores` array, so switching views doesn't reset what's currently filtered.

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
- `POST /api/community/post` — Creates a `/community` feed post (1–500 chars, optional `store_id` tag and/or `photo_url`), rate-limited to 10/hour
- `POST /api/community/like` — Upserts or deletes a like on a `/community` post
- `POST /api/community/comment` — Adds a flat (non-threaded) comment to a `/community` post (1–300 chars), rate-limited to 20/hour
- `POST /api/community/follow` — Upserts or deletes a `follows` row between the caller and another user
- `POST /api/admin/delete-user` — Admin user deletion
- `POST /api/admin/kroger-sync` — Admin-triggered, one chunk of matched store×drink pairs per call (client loops until done). See "Kroger Integration" below
- `GET /api/cron/kroger-sync` — Same sync, on a schedule via `vercel.json`, authenticated by `CRON_SECRET` instead of an admin session. See "Kroger Integration" below
- `GET /api/admin/kroger-search-locations` / `POST /api/admin/kroger-match-store` — searches Kroger locations near a store's zip code, and sets/clears `stores.kroger_location_id`
- `GET /api/admin/kroger-search-products` / `POST /api/admin/kroger-match-drink` — searches Kroger's product catalog by term (scoped to a matched store's location), and sets/clears `drinks.kroger_upc`
- `POST /api/admin/kroger-import-locations` — pulls Kroger's own locations near a zip code; auto-links to an existing store within ~150m or creates a new one otherwise
- `POST /api/invite` — Converts a waitlist entry to a full account

### Admin Dashboard

`/admin` (`src/app/admin/page.tsx`, one large client component) is tier-gated to `is_admin` profiles. Tabs, from the dashboard home grid:

| Tab | Icon | Purpose |
|---|---|---|
| Pending Stores | 🕐 | Approve/reject store submissions; badge count = pending count |
| Location Flags | 🚩 | Resolve user-reported issues on existing stores; badge count = open flags |
| Locations | 📍 | Edit/delete any approved store; grouped into collapsible cards by state |
| Drinks | 🥤 | Add/remove catalog drinks; grouped by brand |
| Users | 👤 | Toggle `is_verified_reporter`, `is_admin`; delete users |
| Waitlist | 📋 | Convert waitlist signups to invited accounts |
| Kroger | 🛒 | Match stores/drinks to Kroger, bulk import, trigger sync — see "Kroger Integration" below |

Two UI conventions introduced for the Locations and Kroger tabs, reusable for any future admin list that grows long:
- **Collapsible grouping**: `toggleInSet<T>()` is a generic Set-toggle helper — each group (a state, a brand) is a card with a header button that flips membership in an `expanded*` `Set<string>` state var, content only rendered when open.
- **State grouping via address parsing**: `extractStateAbbr(address)` — matches a 2-letter USPS abbreviation immediately before a 5-digit zip, or falls back to scanning for a full state name (covers Nominatim-geocoded addresses, which spell out the state). Deliberately reads from the existing `address` string rather than a dedicated `stores.state` column — see the callout in "Kroger Integration" below for why that's not an oversight.

### Kroger Integration

Supplements crowdsourced stock reports with official availability data from Kroger's Products API — kept as a visually distinct "✅ Verified: In/Out of Stock" badge (plus an inline "· Xh ago" freshness label, since a stale Kroger check sitting next to a fresher crowd report needs to visibly read as the older signal, not a flat contradiction) on the store page rather than merged into `stock_reports`, so it never gets conflated with a user's own report.

**Current status (as of this writing):**
- ✅ DB migration (`scripts/create-kroger-integration-tables.sql`) confirmed run against production — `stores.kroger_location_id`, `drinks.kroger_upc`, and the `kroger_stock` table all exist.
- ✅ Real `KROGER_CLIENT_ID`/`KROGER_CLIENT_SECRET` are set in **Vercel's** env vars (production only — not in local `.env.local`, which only has placeholders so `npm run build` works offline).
- ✅ Kroger's Locations search (`searchKrogerLocations`) and Products search (`searchKrogerProducts`) have been exercised live and return real candidates — the query param names in `src/lib/kroger.ts` are confirmed correct.
- ✅ The availability lookup (`getKrogerProductAvailability`) is confirmed working end-to-end against real data. It initially reported every drink as out of stock — the real cause was `fulfillment.inStore` (capital S) being read as `fulfillment.instore`, a pure casing mismatch that silently evaluated to `undefined`/`false` for every pair rather than erroring. Fixed in both `getKrogerProductAvailability` and `searchKrogerProducts`.
- ⚠️ `CRON_SECRET` must be set in Vercel for the scheduled sync to run at all — without it, `/api/cron/kroger-sync` just 401s forever, silently. Also double check the cron schedule (below) is actually allowed on your Vercel plan.

**Data model:**
- `src/lib/kroger.ts` — server-only client-credentials OAuth wrapper (`KROGER_CLIENT_ID`/`KROGER_CLIENT_SECRET`) plus thin Locations/Products API calls. Only the **Products** and **Locations** API products are needed — no customer-login scopes (Cart/Order/Profile), since this never acts on a real shopper's account.
- The "Verified" badge shows a coarse stock level (High/Medium/Low/Out of Stock), not just a flat in/out boolean — sourced from Kroger's `inventory.stockLevel` field. Only `"HIGH"` has been observed live so far; `MEDIUM`/`LOW` are handled defensively (`krogerStockLabel`/`krogerStockColors` in `src/app/store/[id]/page.tsx`) but not yet confirmed against a real response. Any unrecognized or missing level falls back to a generic "In Stock" label/color rather than guessing. Requires the `kroger_stock.stock_level` column added to `scripts/create-kroger-integration-tables.sql` — re-run that script (it's fully idempotent) if it was run before this column was added.
- **Conflict flag**: when a drink has both a crowd report and a Kroger check and they disagree on plain in-stock/out-of-stock (`krogerConflictsWithCrowd()`), the Kroger badge is replaced (not supplemented) by a single dated historical note ("⚠️ Kroger's last check (Xh ago) said [level] — differs from the report above") instead of two same-weight competing pills. Earlier this rendered as a separate "Reports disagree" badge sitting next to the Kroger badge, which read as contradictory noise, especially beside 0/0 confirm-vote counts that looked unrelated. Still deliberately doesn't auto-pick a winner — the crowd report's own freshness label stays the primary, undisturbed signal; the Kroger note is explicitly framed as older/differing context, not a second vote.
- Matching is a **suggest-and-confirm flow, not automatic** — a human always picks the right candidate, since only a person can confirm two listings are really the same place/product. Store matching and drink matching are independent axes:
  - A **store** is matched once, to one Kroger `locationId`.
  - A **drink** is matched once, **globally** (not per store) — a UPC is the same everywhere, so matching "Red Bull 8.4oz" once covers every store, not once per store. Product search still needs *some* matched store's location to scope the search against (Kroger's API requires a `locationId` param), but the resulting UPC applies universally.

**Admin UI** (`/admin` → **Kroger** tab):
- **Sync Availability** — the "Sync Now" button; see chunked sync below.
- **Import Kroger Locations** — bulk-pulls every real Kroger location near a zip code (Kroger's API is zip+radius based, no "whole state" query — repeat per metro area). Per location: links to an existing store within ~150m (avoids duplicate pins for a store that's already crowdsourced) or creates a new `stores` row (`type: 'grocery'`, `status: 'approved'`). **Additive only** — never removes or replaces non-Kroger stores, since Kroger doesn't meaningfully operate in Florida and the app covers more retailers than just Kroger.
- **Match Stores** — list of all approved stores, grouped into collapsible cards **by state** (parsed live from each store's free-text `address` field via `extractStateAbbr()` in `src/app/admin/page.tsx` — deliberately *not* a DB column; see the callout below on why). Each card header shows an `X/Y matched` count. A "Find Matches for All" button bulk-searches every unmatched store (150ms delay between calls).
- **Match Drinks** — same collapsible-card treatment, grouped **by brand** instead of state. Requires picking one matched store from a dropdown first (to scope Kroger's product search), then bulk or individually searches/matches drinks. Remember: this only ever needs to be done once per drink, not once per store.
- **Locations** tab (separate from the Kroger tab) — general store edit/delete list, also grouped into collapsible state cards using the same `extractStateAbbr()` helper.
- Why address-parsing instead of a `stores.state` column: an earlier attempt at a real `state` column (for a now-abandoned NC/FL map-focus feature) was pushed to production **before its migration was ever run**, which broke `/api/stores/nearby` and `/api/stats` in production (`column "state" does not exist`) since those routes `.select()`ed a column that didn't exist yet. That feature was fully reverted. The state-grouping in the admin UI intentionally avoids repeating that mistake — it derives the state from data that's already guaranteed to exist (`address`), so there's no migration to forget.

**Store page rendering** (`src/app/store/[id]/page.tsx`): a drink matched to a Kroger UPC gets its own row on the store page **even with zero crowdsourced reports** — otherwise a store synced with real Kroger data but no user reports would still show "No reports yet" with nowhere for the badge to attach to (rows there are normally sourced from `latest_stock`). These Kroger-only rows show a "📦 Store-listed: [level]" badge (not "✅ Verified" — that wording implies a human confirmed it, which isn't true for a catalog match with zero community reports) and a muted "No reports yet" label in place of the freshness/quantity/confirm/report-history UI that doesn't apply without an actual report. The brand-group "X/Y in stock" ratio and the page header's "last reported" timestamp both explicitly exclude these synthetic rows, so they can't get inflated or show nonsense ages.

**Chunked sync** (`src/lib/krogerSync.ts`): shared `runKrogerSyncChunk(offset)`, walking `KROGER_SYNC_CHUNK_SIZE` (40) matched-store × matched-drink pairs per call, in deterministic id-order so pair indexing stays stable across repeated chunked calls (`stores`/`drinks` are explicitly `.order('id')`ed — without that, Postgres doesn't guarantee stable row order across separate queries, which would skip or double-sync pairs). A single request can't safely walk every pair once match counts grow past a few dozen — Vercel would kill the function mid-loop with no partial result returned. Both sync entry points call this same function:
- `POST /api/admin/kroger-sync` — admin-triggered from the Kroger tab's "Sync Now" button; the client loops, calling with the previous response's `nextOffset` until `done: true`, showing live progress on the button itself (`Syncing 80/150…`).
- `GET /api/cron/kroger-sync` — scheduled via `vercel.json` (`0 0 * * *`, once daily — Vercel's Hobby plan rejects any cron expression that would run more than once a day, confirmed against this project's own account, so this isn't a hypothetical caveat), authenticated by `CRON_SECRET` rather than an admin bearer token (Vercel auto-sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests once that env var is set in the Vercel project). Loops chunks internally under a 50s time budget within `maxDuration = 60`. If this project ever moves to a Pro plan, a more frequent schedule (e.g. `0 */6 * * *`) becomes possible. This has no persisted progress between separate cron runs (each one restarts at `offset: 0`) — fine at the current small scale, but revisit if the matched-pair count ever grows large enough that one run's time budget can't reach the end of the list.

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

### Notifications & Nav Icons

Notifications have their own bottom-nav tab (**Alerts**, `/notifications`) rather than a header bell icon — `NotificationBell.tsx` was removed. `src/hooks/useUnreadNotifications.ts` holds the shared unread-count fetch + real-time subscribe logic (previously inside `NotificationBell`), used by both `BottomNav.tsx` (mobile) and `SideNav.tsx` (desktop) so the badge count works identically on both without duplicating the Supabase query. It subscribes to both `INSERT` and `UPDATE` on `notifications` and re-fetches the exact unread count on any change, rather than incrementing locally — needed because read state is now explicit (see below), not something the hook can infer just from visiting the page.

Nav icons are custom inline SVGs (`src/components/NavIcons.tsx`) instead of system emoji — emoji rendered with mismatched weights across devices (some bold/colorful like 👥🔔, some thin/monochrome like 🗺️). Each icon takes an `active` boolean: active renders a solid lime fill, inactive a gray outline, matching the lime-for-active convention used elsewhere (toggle buttons, active filter chips). The Alerts icon carries the unread-count badge as a small red circle positioned over the bell SVG. Notification cards use a sibling set, `src/components/NotificationIcons.tsx` — same lime line-icon language, no active/inactive state needed — via a `notificationIcon(type)` lookup with a bell fallback for unmapped types.

The `/notifications` page:
- **Explicit read state** — visiting the page no longer auto-marks everything read. Tapping a card marks just that notification (or its whole group) read; a lime border/tint/dot marks unread cards. A "Mark all read" button sits next to "Clear all" in the header (only shown when there's something to act on).
- **Grouped cards** — consecutive `stock_update` notifications sharing the same `store_id` and calendar day collapse into one card ("N stock updates" + a bulleted list of each notification's raw `message` text + a single "View Stock →" link), instead of repeating the store name per flavor. Bullets reuse each notification's existing `message` text rather than re-parsing drink names out of it, since the `notify_stock_update` Postgres RPC that generates these (`supabaseAdmin.rpc('notify_stock_update', ...)` in `/api/stock/report`) isn't defined in any SQL script in this repo — it was created directly in the Supabase dashboard, so its exact message format isn't something this code can safely assume.
- **Date section headers** — "TODAY" / "YESTERDAY" / weekday name / "Mon D", computed per-item and only rendered when it changes from the previous item.
- **Filter chips** — All / ⚡ Reports / 🏪 Stores / 🥤 New Drinks, filtering before grouping.

### Flavor Alerts

"Follow a flavor" — a user taps the 🔔 bell on any drink card (store page) to get notified the next time it genuinely restocks. Defined in `scripts/create-drink-alerts-tables.sql` (not yet run against production as of this writing).

- **In-app only, no push** — deliberately built on the existing `notifications` table + the Alerts nav tab rather than OS-level push notifications, which would need separate infrastructure (VAPID keys, a service worker push handler, stored push subscriptions, a send endpoint) not yet built. An alert fires while the app is open/foregrounded; it won't wake a closed app.
- **No paywall/tier gating** — every user gets unlimited alerts at any scope for now. A tiered version (e.g. radius/anywhere scope or alert count gated behind `tracker`) was considered but explicitly deferred.
- **One alert per user+drink** (`drink_alerts`, `UNIQUE(user_id, drink_id)`) — tapping an inactive bell opens a scope-picker sheet (This store only / Within N miles / Anywhere); tapping an active bell unfollows immediately, no sheet, since following needs a scope decision but unfollowing doesn't. Radius scope anchors to the *store's* lat/lng at the time the alert was created (not the user's live location), so the "in range" set stays meaningful after they leave.
- **Restock detection is a DB trigger** (`notify_drink_alert_subscribers()`, same pattern as `automation-badge-notifications.sql`), firing `AFTER INSERT ON stock_reports`. Only fires on a genuine transition into stock — the new report isn't `'out'`, and the prior report for that store+drink (if any) was `'out'`. A same-state re-report (already in stock, reported again) deliberately does not notify.
- Only a **single unified alert** exists per drink — no separate "notify on brand-wide new drops" toggle. That's a different data shape (brand-level, not drink-level) and was scoped out of this pass.
- No "Rare Find" auto-tagging (flavors with a history of low stock) — would need report-history data that's currently only fetched on-demand for `tracker` users, not eagerly for everyone.
- Managed from `/account` → **Saved** tab, below Favorites (not a separate nav tab, to avoid crowding the bottom nav).

### Stock Report Accuracy

Stock reports on store pages show a freshness state based on age:
- **Fresh** — reported < 2h ago
- **Aging** — 2–12h ago
- **Stale** — 12–24h ago
- **Unverified** — > 24h ago (greyed out)

All users see the freshness label; `tracker` tier users additionally see the exact time ago.

Each drink card shows ✓/✗ community confirmation buttons. Votes are stored in `stock_confirmations` and displayed as counts. Optimistic UI updates on tap; tapping the same button again removes the vote.

### Report Stock Flow

`/submit/drinks` splits the catalog into two sections rather than one flat brand list. A brand counts as "this store's" once any of its flavors has ever been reported there (`latest_stock` for that `store_id`) — every other catalog flavor of that brand joins it too, since a store carrying a brand plausibly carries flavors nobody's specifically reported yet:
- **"This Store's Flavors"** — collapsible per brand (tap the brand header to expand/collapse, same `expandedBrands`/`toggleBrand` state as "Add a brand not listed" below), so a store with many known brands doesn't dump every flavor on screen at once. Once expanded, each flavor row has quick-tap FULL/MED/LOW/OUT buttons directly on it (no drill-down picker), a freshness dot (lime < 12h, amber ≥ 12h, gray if never reported), and a "Fresh · Xh ago" / "No reports yet" label.
- **"Add a brand not listed"** — every other brand, collapsed by default, using the original tap-to-expand-then-tap-a-flavor-to-open-a-picker flow, for genuinely new additions only.
- Searching bypasses this split entirely and falls back to a single flat brand-grouped list (the original full-catalog behavior) across all matches, store-known or not.

### Geofencing & Submission Limits

Stock report submission (`/submit/drinks`) posts to `/api/stock/report`, which enforces everything **server-side** using the caller's bearer token (the client's own Haversine check is just a UX hint — a status message shown before submitting — not the actual enforcement):
- **500m geofence** around the target store. If GPS is unavailable, the check is skipped and submission is still allowed. Admins bypass it entirely.
- **25 reports/day limit** — applies to both `free` and `tracker` tiers; only admins are unlimited.
- **30-minute same-drink dedup** — applies to `free` tier only; `tracker`/admin can re-report the same drink at the same store without waiting.

`/submit/drinks` only auto-requests GPS if the Permissions API reports it's already `granted` (same pattern as `useLocation.ts`) — a user who hasn't decided yet, or already denied, never gets a surprise permission prompt just for opening this page. When skipped, the footer shows a reassuring "Reporting without location — that's okay, it still counts" line with an optional "Verify my location" link that triggers the request on tap. This is deliberately consistent with the server behavior above: no GPS was ever a silent allow, not a block — the client now just stops pushing for it upfront too.

A submission where every pick was deduped returns `{ submitted: 0 }`; the client shows an "already reported" message rather than the success screen in that case.

### Location (iOS Safari)

`src/hooks/useLocation.ts` checks the Permissions API before auto-requesting geolocation. If permission is already `granted`, it requests immediately on mount. Otherwise it waits for a user tap (required for iOS Safari). The initial map screen shows an "Enable Location" button to trigger the first request via user gesture.

**ZIP code fallback**: both location-blocked screens ("Enable Location" and "Location Access Needed"/"Unable to Get Location") also offer a ZIP code search, for users unwilling to grant live GPS access to a new site. Reuses the existing `/api/geocode` route (same one `/add-store` uses for street addresses — Census primary, Nominatim fallback) with just the ZIP as the query string; both geocoders resolve a bare 5-digit ZIP fine. The resulting lat/lng is stored in `manualLocation` state and takes over as the effective location everywhere on the page (`lat`/`lng` prefer `manualLocation` over live GPS) — it's a full substitute, not just a one-time search, so `/api/stores/nearby` and everything downstream behaves identically to a live GPS fix. Deliberately doesn't affect `/submit/drinks`'s own geofence check, which requests its own independent GPS fix at report time regardless of how the user got to the store page.

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
CRON_SECRET                    # Required for the scheduled Kroger sync — Vercel auto-sends it as a bearer token to /api/cron/kroger-sync on the vercel.json schedule
```
