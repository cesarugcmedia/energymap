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
npm run lint     # ESLint 9 CLI (flat config in eslint.config.mjs); also runs during `next build`, so lint errors fail deploys
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
- `/` — Serves two audiences via `HomeGate` (`src/components/HomeGate.tsx`): signed-in users get the map (`src/components/MapHome.tsx`, loaded with `next/dynamic` so landing visitors never download Mapbox); everyone else gets the server-rendered marketing landing page (`src/components/landing/`: `Landing.tsx`, `PhoneMockup.tsx` — a drawn, not screenshotted, map illustration — and `landing.module.css`), revalidated hourly with live store/drink/Tracker counts (shown only when they load; never placeholder numbers). An inline script in `layout.tsx` sets `<html data-authed="1">` before first paint when a saved `sb-*-auth-token` exists, and `globals.css` uses it to hide the landing behind a spinner so signed-in users never see a marketing flash. Below the hero, **Live right now** (`LiveTicker.tsx`) scrolls real recent reports from `GET /api/landing/activity` (public, edge-cached 60 s, anonymous: flavor, level, store name, state via `stateOf()` from `src/lib/place.ts`, time; no usernames, ids, street addresses or cities) and renders nothing until real data loads or with fewer than 3 items. (A badges + flavor-collection showcase and the Founding Hunter offer were tried and removed on 2026-11-16; the badge itself is still awarded.) Near the end, **Join the hunt** (`Socials.tsx`) shows big TikTok / Discord / Email (ampedmap@gmail.com, also the contact address on Terms, Privacy, Plan and Contact links) cards; Discord reads "Coming soon" until `NEXT_PUBLIC_DISCORD_URL` is set (it also adds a footer link). On phones, `StickyCta.tsx` pins a "Free to join" bar to the bottom once the hero (`#lp-hero`) scrolls away, hiding again over the closing CTA (`#lp-join`), the FAQ (`#lp-faq`) and footer (`#lp-footer`). Section order (2026-11-16): hero → Live right now → ZIP preview → How it works → Tracker → Pricing → Join the hunt → closing CTA → FAQ (always last) → footer. Before Pricing, **Hunt smarter** (`TrackerShowcase.tsx`) draws the flavor collection (tagged **Free**) next to a restock-patterns card (tagged **Tracker**) — keep the plan tags so the free feature isn't sold as paid (illustrative; the lock-screen push mock was removed 2026-11-16). Landing CTAs link to `/account?mode=signin|signup` (and `&plan=free|tracker` from the pricing cards, which skips straight to the account form). The map: Has a Map View / List View toggle in the header — List View is the filterable/searchable store list (formerly the separate `/stores` route, which now just redirects here)
- `/community` — Social feed **and** rankings, merged into one tab via a Feed / Leaderboard sub-toggle under the header (formerly the separate `/leaderboard` route, which now just redirects here with `?view=leaderboard` — same pattern as the `/stores` merge). Feed: text posts optionally tagged to a store and/or a photo, likes, comments, follow system with a Following filter, Trending/Recent/Following sort, trending-stores widget. Leaderboard: rankings via the `get_leaderboard` Supabase RPC, fetched lazily only once that sub-tab is opened.
- `/notifications` — "Alerts" tab; every notification type in one list (badge unlocks, comment replies, drink-alert restocks, admin store approvals, etc.) — see "Notifications & Nav Icons" below
- `/submit` — Stock report submission
- `/add-store` — Store submission form
- `/account` — Profile, badge, stats, subscription management
- `/admin` — Admin dashboard (tier-gated)

### Auth & User State

`src/contexts/AuthContext.tsx` is the source of truth for auth state. It only resets `loading` and refetches the profile when the signed-in user **id** changes — Supabase also fires INITIAL_SESSION, TOKEN_REFRESHED and focus-time SIGNED_IN events, which used to drop every page back to its full-screen loader and re-run fetches keyed on `user`; `refreshProfile()` updates in place (no loader) once a profile exists. **Tab-switch speed:** the Community feed and Alerts list keep their last data in a module-level cache and paint it instantly on return (then refresh quietly), `useLocation` reuses the session's last GPS fix instead of showing the locating loader again, and `useNearbyStores` keeps showing expired cached stores while refetching. It provides `user` (Supabase auth user) and `profile` (app-specific profile row) to the entire app. Profile fetching uses up to 4 retry attempts with exponential backoff.

**Google sign-in**: `GoogleSignInButton` (in `src/app/account/page.tsx`) sits atop both the sign-in and create-account cards, hidden unless `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. It stashes the chosen plan in `localStorage.pending_profile` (`{ tier }`, no username) and calls `signInWithOAuth` back to `/auth/callback`. The callback, on finding no profile and no pending username, hands off to `/account`, whose `SetupProfile` screen asks for a username, inserts the profile, sends the welcome email and continues a Tracker signup via `/api/upgrade/tracker` — usernames are never derived from the email address.

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
- `follows` — `follower_id`/`followed_id` pairs powering the Community "Following" filter and the follower/following counts on profile pages (`/u/[username]`). Also defined in `scripts/create-community-v2-tables.sql`
- **Community v3** (`scripts/community-v3.sql`, not yet confirmed run): `community_posts.post_type` (post/found/looking), `drink_id`, `quantity`, `photo_urls[]`, `hidden_at`; `community_post_comments.parent_id` (one-level threads) and `store_id`; `community_reports`; `user_blocks`; `notifications.post_id`; realtime on `community_posts`. **The client feature-detects v3** (`isMissingSchema()` in `src/lib/community.ts`: tries the v3 select, falls back to v2 columns on an undefined-column error) so the feed never breaks before the migration runs — v3-only UI (post types, multi-photo, replies, report/block) just stays hidden. Never add a hard dependency on these columns without that fallback.

**Storage**: `community-photos` bucket (public read, created by `create-community-v2-tables.sql`) holds `/community` post photos, uploaded client-side to a `<user_id>/...` path enforced by storage RLS. `/api/community/post` only accepts a `photo_url` that matches the caller's own bucket path — never an arbitrary external URL.

**Supabase row cap**: The server-side `max_rows` is 1,000. Any query fetching all stores must paginate using `.range(from, from + BATCH - 1)` in a loop — never rely on `.limit()` alone.

Admin and webhook operations use the service role client (bypasses RLS). Regular client uses the anon key (subject to RLS policies).

### Tier System

**Plan split (2026-11-16)** — the free plan must stand on its own; Tracker sells extras on top, never basics. Limits and plan copy live in one file, `src/lib/plans.ts` (`FREE_RADIUS_MILES` = 20, `FREE_ALERT_LIMIT` = 5, `FREE_FEATURES` / `TRACKER_FEATURES` / `TRACKER_PITCH`), used by the landing pricing cards, Account → Plan's comparison, upsells and the server routes.

| Tier | Features |
|---|---|
| `free` | 20-mile map radius, exact report times, reporting (25/day) + adding stores (10/day), follow up to 5 flavors, community/profiles/badges/leaderboard |
| `tracker` | Unlimited radius, unlimited flavor alerts, **push restock notifications**, **restock patterns** on store pages, saved store lists, a Tracker chip on their profile, unlimited store adds, no 30-min same-drink dedup (not advertised) |
| `admin` | All tracker features + moderation |

- **Flavor alert cap**: `alertSlotsLeft()` (`src/lib/flavorAlerts.ts`) is checked before every `drink_alerts` save (store-page bell, Account → Flavor Alerts search, Community post bell, onboarding — which disables picks past the limit). At the limit, `UpgradeSheet` (`src/components/ui/UpgradeSheet.tsx`, portaled) explains it. Server-side, the `trg_drink_alert_limit` trigger in `scripts/tracker-features.sql` refuses a 6th row for free accounts with an `alert_limit` error (`isAlertLimitError()`); existing over-limit follows are kept.
- **Push restock notifications**: `public/sw.js` handles `push` + `notificationclick`; `src/lib/pushClient.ts` subscribes the device (iPhone needs the app added to the Home Screen) and `POST /api/push/subscribe` saves it to `push_subscriptions` (Tracker only; `{ remove: true }` unsubscribes for anyone). `/api/stock/report` uses `after()` to look up the `drink_alert` notifications its insert triggered (by time + store name) and sends them to Tracker subscribers via `sendPush()` (`src/lib/push.ts`, `web-push`; dead subscriptions are deleted). Toggle: Account → Notifications → **Push restock alerts** (`PushSettings.tsx`). Needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; without them the toggle says "coming soon" and sending is a no-op.
- **Restock patterns**: `GET /api/stores/patterns?store_id=&tz=` (Tracker only) buckets "level went up" reports by weekday/time of day (falls back to Full reports when there are fewer than 3 restocks) and lists the flavors that ran out most in 30 days. `src/components/store/RestockPatterns.tsx` shows it under the store page's actions; free accounts get a blurred sample with "Unlock with Tracker". Needs history, so `tracker-features.sql` extends report retention from 7 to 90 days.

Tier upgrades go through Stripe. The webhook at `/api/stripe/webhook` handles fulfillment by updating `profiles.tier` and `profiles.stripe_customer_id`.

Favorites (the heart/save-a-store list, `favorites` table) is gated behind `tracker` consistently in both places it's surfaced — the dedicated `/lists` page and the Saved Stores page on `/account` — both showing the same "Tracker Feature" upsell card for `free` users. (`/account`'s saved-stores view used to render favorites ungated to any logged-in user regardless of tier, a drift from `/lists`' paywall; fixed so the two entry points agree.) Flavor Alerts, which live on their own `/account` page, are deliberately **not** tier-gated — see "Flavor Alerts" below.

### Maps

`src/components/MapView.tsx` renders a Mapbox GL map. Supercluster aggregates store markers client-side (radius: 60px, max zoom: 16). The user's live location shows as a pulsing dot. Store markers use line-icon SVGs (`storeTypeIconSvg()` from `src/components/Icons.tsx` — see "App-Wide Icon System" below), not emoji. Radius is enforced **server-side** in `/api/stores/nearby` (free/anon capped to `FREE_RADIUS_MILES` = 20 miles, tracker/admin unlimited) — the server determines tier from the caller's bearer token, so a free-tier client never receives out-of-radius stores over the wire.

Clusters and individual store markers are **freshness-coded**: `src/app/page.tsx` collapses each store's most recent report age to a binary `'fresh' | 'stale'` signal (< 1 day = fresh, mirroring the store page's Fresh bucket — thresholds live in `src/lib/freshness.ts`; no reports at all also reads as stale) and passes it into `MapView` as `storeFreshness`. A cluster aggregates its members via Supercluster's `getLeaves()` — all-fresh renders lime, all-stale renders gray, a mix renders amber — so density-grouped pins don't lose the "worth a trip vs. probably dead data" signal once stores get bucketed together. An always-visible legend (bottom-left) explains the three colors; there's no toggle for it since the colors need explaining at a glance, not on request.

**Map/List upgrades (2026-11-14):** `sortedBase` = every filter except a picked drink; the map plots `mapStores` (= `sortedBase`, minus non-fresh stores when the **Fresh only** chip is on) and passes `highlightIds` (stores carrying the picked drink) to `MapView`, which dims non-matching pins/clusters to 30% instead of hiding them; the list uses `sorted` (drink filter applied). `storeSummary` gives each store its in-stock count + top 3 in-stock flavors (fullest, then freshest), shown in the pin popup and on list cards. A swipe-up "N stores nearby" sheet sits at the bottom of the map (hidden while a popup/welcome sheet is open; tap a row to select + fly to it); legend and zoom controls shift up while it shows. List View: sticky search/controls, one **Filters** sheet (distance, type, brand, with an active-count badge) plus Nearest / Freshest / Most in stock sort chips, incremental rendering 30 at a time via an IntersectionObserver on the list's own scroll container, and a save heart on cards for Tracker (`favorites`). The Mapbox dark style is recolored at load to the app's neutral palette (gray roads, muted labels, neutral buildings). Previously: Map View also carries its own search box + store-type filter chips in the header (mirroring List View's), and both actually filter what's plotted — `MapView` is fed the same already-filtered `sorted` list List View uses, not the raw unfiltered `stores` array, so switching views doesn't reset what's currently filtered.

**Search matches both stores and drinks.** The full drinks catalog is fetched once client-side on mount; free-text search matches a store's name/address *or* the brand/name/flavor of anything in that store's `latest_stock`, so typing a flavor name (not just a store name) narrows the map/list correctly. Typing also opens a typeahead dropdown (shared by both views) with up to 5 drink matches and 5 store matches — drink suggestions are restricted to drinks actually in stock (non-`'out'`) at a currently-loaded nearby store, so picking one can never filter down to zero results. Picking a store suggestion navigates straight to `/store/[id]`; picking a drink suggestion sets a `drinkFilter` (by `drink_id`, not just brand string like the existing brand-chip filter) that narrows `sorted` to stores currently carrying that exact drink, and mirrors the drink's name into the search box for feedback. Editing the box by hand after picking a drink clears `drinkFilter` so stale filtering doesn't linger.

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
- `GET /api/preview?zip=` — Public, no-login teaser behind the landing page's "See what's near you" box (`src/components/landing/ZipPreview.tsx`): geocodes the ZIP, bounding-box-queries stores within the free-tier radius (20 miles), and returns at most 5 stores (reported-first, freshest first) with up to 3 in-stock drinks each and no store IDs. Rate-limited 15/min per IP and edge-cached per ZIP for 5 minutes (`s-maxage=300`). Geocoding lives in `src/lib/geocode.ts`, shared with `/api/geocode`
- `GET /api/stores/nearby` — Returns approved stores near `lat`/`lng`, tier-filtered server-side (5mi cap for free/anon, unlimited for tracker/admin)
- `POST /api/stock/confirm` — Upserts or deletes a community confirmation vote on a stock report (currently unused — see "Stock Report Accuracy" below)
- `POST /api/community/post` — Creates a `/community` feed post (1–500 chars, optional `store_id` tag and/or `photo_url`), rate-limited to 10/hour
- `POST /api/community/like` — Upserts or deletes a like on a `/community` post
- `POST /api/community/comment` — Adds a flat (non-threaded) comment to a `/community` post (1–300 chars), rate-limited to 20/hour
- `POST /api/community/follow` — Upserts or deletes a `follows` row between the caller and another user
- `POST /api/admin/delete-user` — Admin user deletion
- `POST /api/invite` — Converts a waitlist entry to a full account

### Community Feed

`/community` → Feed (`src/components/community/`): `Feed.tsx` (paging 15 at a time by `created_at` cursor with IntersectionObserver infinite scroll, pull-to-refresh on `<main>`, realtime "N new posts" pill, filters Latest / Trending (likes+comments decayed by age, `trendingScore`) / Following / Near me (posts tagged to stores within 10 mi of `profiles.last_lat/last_lng`). **Posts only** — the auto stock-report/new-store activity cards (and `/api/community/activity`) were removed on 2026-11-15; the feed is for conversation, "Hot stores this week" chips, report sheet, blocks), `PostCard.tsx` (type label, drink tag with follow-flavor bell → `drink_alerts` anywhere scope, photo grid + `Lightbox.tsx`, store card with live `latest_stock` summary, ⋯ menu: delete own / report / block, threaded comments, Looking-for answers can tag a store), `Composer.tsx` (Post / Found it / Looking for; Found it also calls `/api/stock/report` so posting a find files the report, subject to the usual geofence/limits; location only used if already granted), `Pickers.tsx` (store/drink search), `RichText.tsx` (@mentions → `/u/name` links). Server: `/api/community/post` and `/comment` parse @mentions and notify (`notifyMentions`), comment notifies the post author ("answered your looking-for post") and the parent-comment author; `notify()` attaches `post_id` when the column exists and retries without it otherwise. Profiles: `/u/[username]` + `GET /api/community/profile` — header (verified, weekly champion, streak chip, joined), a 6-stat grid (reports, flavors found, stores added, followers, following, badges), an earned-badge strip, Recent finds (last 6 in-stock reports), "Reports most at" (top 3 stores), then posts. Badges are computed server-side with `computeBadges()` from `src/lib/badges.ts` (the shared 18-badge `BADGE_DEFS`, also imported by `/account`); night owl / early bird use the viewer's timezone offset (`?tz=`) as a stand-in for the owner's. Stats come from the last 1,000 reports, so they inherit the 7-day pruning of non-latest reports. Moderation: admin **Community Reports** tab (`src/components/admin/CommunityModeration.tsx`, `/api/admin/community-moderation`: hide post via `hidden_at`, delete comment, dismiss). Deleting own posts/comments uses the existing RLS delete policies directly from the client.

### Leaderboard

`src/components/community/Leaderboard.tsx` (Community → Leaderboard). Three controls: **Who** (Everyone / Following — the same data filtered to you + people you follow / Near me — 10 mi of `profiles.last_lat/lng`), **What** (Points from the dashboard-defined `get_leaderboard` RPC / Stores added / Flavors found), **When** (All time / This month / This week). Stores added, Flavors found and Near me come from `GET /api/community/leaderboard?board=stores|flavors|near` (service role; also returns the caller's own rank when outside the top 50). Near me and Flavors found are **weekly-only** because `automation-stale-cleanup.sql` prunes non-latest stock reports after 7 days, so longer windows would undercount; Stores added supports any window since stores aren't pruned. UI: podium for the top 3, a "you vs. next" card with a progress bar and a concrete target (points assume +2 per reported drink), a This Week reset countdown to Monday 00:00 UTC (the weekly-champion cron), list rows link to `/u/[username]`. A weekly prize for the champion is parked until there are more users.

### Admin Dashboard

`/admin` (`src/app/admin/page.tsx`, one large client component) is tier-gated to `is_admin` profiles. It has no bottom/side nav tab — the only entry point is the **Admin Dashboard** row on `/account` (shown to admins only); the nav stays visible on `/admin` with the Account tab highlighted, and the dashboard home has a "‹ Account" back button. Tabs, from the dashboard home grid:

| Tab | Icon | Purpose |
|---|---|---|
| Pending Stores | 🕐 | Approve/reject store submissions; badge count = pending count |
| Location Flags | 🚩 | Resolve user-reported issues on existing stores; badge count = open flags |
| Locations | 📍 | Edit/delete any approved store; grouped into collapsible cards by state |
| Drinks | 🥤 | Add/remove catalog drinks; grouped by brand |
| Users | 👤 | Toggle `is_verified_reporter`, `is_admin`; delete users |
| Waitlist | 📋 | Convert waitlist signups to invited accounts |

Two UI conventions used by the Locations and Drinks tabs, reusable for any future admin list that grows long:
- **Collapsible grouping**: `toggleInSet<T>()` is a generic Set-toggle helper — each group (a state, a brand) is a card with a header button that flips membership in an `expanded*` `Set<string>` state var, content only rendered when open.
- **State grouping via address parsing**: `extractStateAbbr(address)` — matches a 2-letter USPS abbreviation immediately before a 5-digit zip, or falls back to scanning for a full state name (covers Nominatim-geocoded addresses, which spell out the state). Deliberately reads from the existing `address` string rather than a dedicated `stores.state` column: an earlier attempt at a real `state` column was pushed to production **before its migration was ever run**, which broke `/api/stores/nearby` and `/api/stats` (`column "state" does not exist`). Deriving the state from data that already exists means there is no migration to forget.

### Kroger Integration (removed)

A Kroger Products/Locations API integration ("Verified" stock badges on store pages, an admin Kroger tab for matching stores/drinks, and a daily Vercel cron sync) was built and then removed on 2026-11-13 — not wanted. All code, routes, `vercel.json` (it only held the Kroger cron) and the creation migration are gone. Stores that were created by the Kroger location import were deliberately kept, since they are real approved stores. `scripts/remove-kroger-integration.sql` drops `kroger_stock`, `stores.kroger_location_id` and `drinks.kroger_upc`; run it only after the code removal is deployed, never before.
### Account Tab

`/account` (logged in) is laid out like iOS Settings: a large "Account" title, a profile card, then grouped rows (lime icon tiles, right-side value, chevron) for Plan · Badges / Saved Stores / Flavor Alerts · Username / Password · Admin Dashboard (admins only, links to `/admin`) · Terms / Privacy · Log Out · Delete Account. Each row drills into a sub-page (`accountPage` state) with a "‹ Account" back button; opening one pushes a history entry and a `popstate` listener returns to the list, so the phone's back gesture works instead of leaving `/account`. Rows and groups are plain render functions (`row()`, `group()`), not components defined in render, so the username/password inputs don't remount and lose focus. The **Plan** page is `src/components/account/PlanDetails.tsx`, fed by `GET /api/account/plan` (tier, today's usage vs. the 25-report / 10-store limits, and the Stripe subscription: status, renewal date, price, card, start date); it shows a Free vs Tracker comparison table and a billing FAQ. **Cancelling sets `cancel_at_period_end`** (`/api/stripe/cancel`) — the member keeps Tracker until the paid period ends, matching the Terms, and the `customer.subscription.deleted` webhook drops them to free then; `{ resume: true }` undoes it ("Keep Tracker"). (A Notifications page with two toggles was removed: they only saved a localStorage flag nothing read. Bring real controls back with push notifications.)

**Flow updates (2026-11-15):**
- **Account → Notifications** (`'notifications'` subpage, deep-linkable): on/off switches per group — Flavor restocks / Stock updates / Community / Stores & drinks / Badges (`NOTIFICATION_GROUPS` in `src/lib/notificationPrefs.ts`). Muting is applied **on read** (the Alerts list and `useUnreadNotifications` add `.not('type', 'in', …)`), because several notification types are inserted by triggers/RPCs that live in the Supabase dashboard. Saved to `profiles.muted_notification_types` (`scripts/profile-extras.sql`) and mirrored to localStorage; this device's copy wins, and a `muted-notifications-changed` event keeps the tab badge in sync. When adding a notification type, add it to a group there too.
- **Own profile = public view (2026-11-15):** the Account profile card opens `/u/[username]` (the old Account → Profile subpage is gone). On your own profile an **Edit profile** button swaps in the editor (`ProfilePhoto` + `ProfileExtras` + a Username row → `/account?page=username`); Save (or Cancel) returns to the public view. Profile tabs are Posts / Finds / Collection (Stores tab removed).
- **Account → Profile** (now Edit profile) has an "About you" card (`src/components/account/ProfileExtras.tsx`): a ≤160-char bio and a favorite drink (catalog search), shown on `/u/[username]`. Columns `bio`, `favorite_drink_id` come from `scripts/profile-extras.sql` (not yet confirmed run); `/api/community/profile` falls back to the base columns until then, and saving shows "isn't switched on yet".
- **Sign-up**: live username availability (debounced 400 ms, same `profiles` lookup as submit) and a 4-segment password strength meter (length + character variety).
- **Map search**: focusing the empty box shows **Recent** (last 5 picked stores/flavors, `localStorage.ampedmap_recent_searches`, with Clear) and **In stock near you** (flavors in stock at the most loaded stores) chips.
- **Store page sheets**: Add a flavor suggests existing catalog brands as you type, lists that brand's existing flavors, and warns live "X is already in the catalog — Report it" (loose match: case/spacing/punctuation-insensitive); Report a problem uses reason chips (`FLAG_REASONS`: Permanently closed, Moved, Wrong pin, Wrong address, Duplicate, Not a store, Other) with a reason-specific hint for the optional note.
- **Finding people**: Community header **Find people** opens `src/components/community/PeopleSheet.tsx` (username search); tapping Followers / Following on `/u/[username]` opens the same sheet as a list. Both use `GET /api/community/people` (`?q=` or `?list=followers|following&user=`, service role, hides people you blocked, each row has a Follow button). Store-page flavor rows show "· by @name" for the latest report's author via `GET /api/stores/reporters?store_id=` (signed-in only).
- **Profiles v2** (`scripts/profile-v2.sql`, not yet confirmed run; everything feature-detects it):
  - **Photos**: `avatars` bucket at `<uid>/avatar.jpg`, center-cropped to a 320px JPEG in the browser (`src/lib/avatar.ts`); a CHECK constraint keeps `profiles.avatar_url` pointing at the user's own folder. Picker: `src/components/account/ProfilePhoto.tsx` on Account → Profile. `Avatar` (`community/RichText.tsx`) takes an optional `url`; feed posts/comments get it via `fetchProfileLites()`, which falls back to usernames only. Leaderboard rows still use the initial.
  - **Privacy** (Account → Privacy): `hide_from_search` (left out of Find people search and suggestions; follower lists and direct links still work) and `anonymous_reports` (store-page "by @name" is hidden; their profile's Finds tab is hidden from others).
  - **Suggested people**: `GET /api/community/people?suggest=1`, shown in Find people before you type. Ranked by: regulars at your saved stores, then shared favorite brands, then reporters within 10 mi, then active hunters overall. Leaves out people you already follow or blocked.
  - **Profile tabs**: Posts / Finds / Collection on `/u/[username]`. **Collection** (`src/components/community/FlavorCollection.tsx`) shows the whole catalog by brand, with found flavors lit. It comes from the permanent `flavor_finds` table (a trigger on `stock_reports` INSERT, backfilled). Before that table exists, it uses the 7-day-pruned reports instead. "Flavors found" counts in-stock reports only.
  - **Share**: Share button (`navigator.share`, falls back to copying the link). `u/[username]/layout.tsx` sets the title, and `opengraph-image.tsx` renders the preview card with the photo and stats.
- **Round 4 (2026-11-15)** (styles at the end of `globals.css`, all reduced-motion safe):
  - **Map live pin flash**: `MapView`'s `flash` prop. `MapHome` sets it from the realtime handler, and lime rings ripple from that store's pin. Clustered stores have no pin, so they're skipped.
  - **`FollowButton`** (`community/FollowButton.tsx`, used on profiles and in `PeopleSheet`): on follow it pops, draws a check, bursts and buzzes.
  - **Collection animations**: brand rows rise in a stagger, their bars fill, and found chips light up in order (`chip-light`).
  - **Profile tab swipe**: swipe the tab content left/right to change tabs (ignored within 24px of the left edge, which belongs to the phone's back gesture). The content slides in from the side you're heading.
  - **`FreshnessRing`** (`ui/FreshnessRing.tsx`): List view cards show a ring that drains over the 3-day `STALE_HOURS`. It pulses while the report is < 2h old.
  - **Report success "+N new flavors"**: `/api/stock/report` returns `collection: { newFlavors, found, total }` (checked against `flavor_finds`, or the remaining reports before profile-v2). `/submit/drinks` stashes it in `sessionStorage.last_report`, and `/submit/result` shows it with a ticking count and a "See collection" link.
  - **Store page "just reported" toast**: realtime `onLiveReport` shows "@name just reported X · Level". It's skipped for your own reports and says "Someone" for anonymous reporters.
  - **Photos everywhere**: `/api/stores/reporters` also returns `avatars`, so the "by @name" line gets a 16px photo. The leaderboard podium and rows load photos via `fetchProfileLites()`.
- **Round 5 (2026-11-15)** (styles at the end of `globals.css`, reduced-motion safe): `RollNumber` (`ui/RollNumber.tsx`, odometer roll) on post like/comment counts; comments that arrive after a card rendered get `comment-new` (slide-in + lime wash); Edit profile slides in (`slide-next`) and Save/Cancel slide the public view back (`slide-back`); Mark all read pops unread dots out top-to-bottom (`dot-out`, `--d` stagger) before rows settle; `MapView` `locatePing` prop + first map idle send `locate-ring` ripples from the user dot (re-center button bumps it); streak flame `flame-grow` when the streak rose since `localStorage.streak_seen_v1:<uid>`; Collection brands at 100% get a Complete chip + shine, and `ConfettiShower` (`ui/ConfettiShower.tsx`) the first time per device (`ampedmap_complete_brands_v1`); Leaderboard compares your rank per board with `lb_rank_v1:<uid>:<scope>:<metric>:<timeframe>` and slides your row up (`rank-climb`) with a ▲ N chip.
- **Live status** (`src/contexts/PresenceContext.tsx`, mounted in `layout.tsx`): one Supabase Realtime Presence channel, `online-users`, keyed by user id; no database table. A signed-in user is tracked while the app is visible (`visibilitychange` untracks/re-tracks) and drops off on close. `useIsLive(userId)` drives a pulsing lime dot on `Avatar` (pass `userId`: posts, comments, PeopleSheet, leaderboard, profile header), plus a "Live now" chip on profiles and an "N hunters live now" line in the Community header that opens Find people. Account → Privacy → **Show when I'm live** (localStorage `ampedmap_show_presence`, per device): turning it off stops tracking you, but you still see others. One global channel is fine at the current scale; split by area past a few thousand concurrent users. Presence sync takes a few seconds to arrive.
- **Status pages** share `src/components/ui/StatusScreen.tsx`: `error.tsx` ("Something shorted out"), `/offline` ("No signal", mentions saved offline reports) and a new `not-found.tsx` 404 ("This page ran dry").

### Sign In / Sign Up

`/account` (logged out) is a single centered card styled like the landing page (`src/app/account/auth.module.css`). Sign-up is one form (username, email, password ≥ 8 chars, terms) — there is no plan-picker step; new accounts start on Free and upgrade later from Account → Plan. Arriving with `?plan=tracker` (landing pricing card) shows a "Signing up for Tracker" note with a "Start on Free instead" link and runs the existing `/api/upgrade/tracker` beta/Stripe flow after signup. When `NEXT_PUBLIC_WAITLIST_ACTIVE=1` and the visitor isn't `?invited=1`, the sign-up card is replaced by a "Join the waitlist" gate. No code path ever derives a username from the email address — a missing profile always routes to `SetupProfile`.

**Plan copy must match enforcement.** Tracker's real perks are listed in the tier table above (and `TRACKER_FEATURES` in `src/lib/plans.ts`). Exact report times are **free** since 2026-11-16. Tracker does **not** lift the 25 reports/day limit, and free accounts still get Flavor Alerts (up to 5) — don't advertise "unlimited submissions".

### Share Links (2026-11-16)

Shared links carry rich previews (texts, group chats, social). Data comes from server-only loaders in `src/lib/shareCards.ts` (`loadStoreCard`, `loadPostCard`; service role, public fields only, hidden posts excluded).
- **Stores**: `src/app/store/[id]/layout.tsx` (title "Store: what's in stock", description with in-stock count, freshness, top flavors) + `opengraph-image.tsx` (name, address, N of M in stock, 4 fullest flavors with level colors, "Reported 2h ago" dot; revalidates every 10 min). Share button in the store-page header and on the report success screen.
- **Posts**: Community share now links to `/p/[id]` (`src/app/p/[id]/`): its own metadata ("@name found X at Store") and preview image (type chip, drink + level, text, store, first photo). Signed-out visitors get a read-only copy with a Join prompt; signed-in visitors are redirected to `/community?post=` (`OpenInApp`). Unknown/hidden posts 404.
- `shareLink()` (`src/lib/share.ts`) opens the share sheet or copies the link; `ShareIcon` lives in `Icons.tsx`.

### Brand Assets & SEO

The logo mark is a dark bolt on a lime (`#C9F400`) rounded square, used in the landing/auth headers and generated (no image files) by `src/app/icon.tsx` (full-bleed, doubles as the maskable manifest icon), `apple-icon.tsx` (square and opaque — iOS applies its own mask) and `opengraph-image.tsx`. `ImageResponse` can't resolve CSS variables, so those files must use literal hex colors. `src/app/robots.ts` keeps admin/API/auth and signed-in-only routes out of search; `src/app/sitemap.ts` lists the public pages; the landing page embeds `WebSite` + `FAQPage` JSON-LD built from its FAQ content. `metadataBase` is set to `https://ampedmap.com` in `layout.tsx`.

### Polish Details

- **Map store cards** lead with "View stock" (store page) + "Directions"; reporting happens from the store page. Exception: when `isAtStore` (nearest store < 0.15 mi), the map shows a dismissible "You're at X — Report stock" banner (dismissal stored per store in `sessionStorage.at_store_dismissed`) and the "You're here" card swaps Directions for Report stock.
- **First-run welcome sheet** on the map (pin colors, tap a store, report at a store), shown once per device (`localStorage.welcome_seen_v1`).
- **Store page** (`src/app/store/[id]/page.tsx`): stock overview card ("N of M flavors in stock", freshness, a Full/Medium/Low/Out mix bar with counts), Report stock + Directions, search + All / In stock / Out of stock chips, brand cards (auto-expanded when ≤ 2 brands or filtering) whose flavors are plain list rows with a soft level pill (dot + word, `LEVEL` map) and the follow bell; out-of-stock flavors are dimmed. "Add a flavor" lives at the bottom as "Don't see a flavor? Add it". Brands ordered by most recent report, flavors by stock level then freshness.
- **Skeleton loaders** (`src/components/ui/SkeletonList.tsx`) replace spinners on the main content lists; full-screen auth-check spinners remain.
- **Scroll reveal**: add the global `reveal` class to any card/section that should fade + slide in the first time it scrolls into view. One app-wide watcher (`src/components/ScrollReveal.tsx`, mounted in `layout.tsx`) uses an IntersectionObserver plus a MutationObserver (so infinite-scroll and route-change content is picked up), reveals anything already on screen immediately with a small stagger, also reveals existing elements that later *gain* the class (it watches `class` attribute changes — React often reuses a node, e.g. a loading placeholder turning into the real card, which otherwise stayed invisible), and marks revealed elements with `data-revealed` (an attribute, not a class, so React re-renders can't undo it). Elements are only hidden while `html.js-reveal` is set, so content stays visible if JS fails. Used on: map list cards, store-page brands, Report Stock brands, Community posts + activity cards, Notifications, Saved stores, profile posts, Account badges, and the landing page's below-the-fold sections (never the hero). Disabled under reduced motion.
- **Motion** (all in `globals.css`, short, and disabled under `prefers-reduced-motion`): `anim-fade` (backdrops), `anim-sheet` (bottom sheets slide up — map store popup keyed by store id so it replays, store-page Add flavor / Flag / alert sheets, add-store and admin sheets, welcome sheet), `anim-rise` + per-item `animationDelay` (staggered list cards: map list, store brands, Community posts, Notifications, Saved; live-update rows; at-store banner), `anim-pop` (heart on save, success ✓ circle, selected map pin), `anim-wiggle` (bell on follow), `press` (scale-down on FULL/MED/LOW/OUT), `anim-draw` (success checkmark stroke). Heart/bell animations are driven by counters (`heartAnim`, `bellAnim`) so they replay only on the action, not on page load. Map pins get `pin-drop` on an INNER wrapper (Mapbox owns the outer element's transform) and only during the first 2s after stores load (`dropInUntilRef`), not on every pan. The success screen ticks its report count up with requestAnimationFrame.
- **Motion, round 2** (also in `globals.css`, all reduced-motion safe): `page-enter` (opacity-only fade on route change — `MainWrapper` keys `<main>` on the pathname; never add a transform there, it would become the containing block for fixed sheets/bars), `anim-fill` (bars grow from the left: store mix bar + level bars, list-card stock bar, Plan usage bars, leaderboard progress), `anim-grow` (leaderboard podium rises 3rd → 2nd → 1st), `anim-bump` (keyed on a count: Report stock "N picked" pill and Submit label), `live-dot` (ring pulse on report dots < 2h old: list cards, store page), `anim-new` (lime wash on notifications that arrive live), `shine` (one sweep across earned badges on Account → Badges and profiles; `--shine-delay`), `burst` (dots fly out of the success checkmark), tab-bar icon pop on switch and unread-badge pop on change. `ui.module.css` buttons/chips/segments/icon buttons scale down slightly on press. `CountUp` (`src/components/ui/CountUp.tsx`) ticks numbers up once they scroll into view — landing store/flavor counts, profile stats, store-page in-stock total, podium scores; it renders the real value server-side and under reduced motion. **Round 3:** `SlideHighlight` (`src/components/ui/SlideHighlight.tsx`) slides the lime pill behind the active option of any `ui.segmented` + `ui.segSlide` control (marks the active child with `aria-selected`/`data-active`) — Map/List, Feed/Leaderboard, leaderboard metric, composer post type; `BoltLoader` (bolt fills with lime and glows, with a breathing message underneath — e.g. "Charging up the map…", "Checking your alerts…") replaces the full-screen spinners; its full-screen mode is a fixed viewport layer so it stays centered regardless of tab-bar padding, the desktop sidebar or mobile browser bars; skeleton shimmer uses a theme-aware `--shimmer`; switching Appearance crossfades via `document.startViewTransition`; `.flame` flickers the profile streak 🔥; store page flashes a flavor row (`anim-new`) and pops its level pill when a live report changes it; Report stock's Submit button morphs to a spinner then a drawn ✓ before navigating; onboarding steps slide (`slide-next`/`slide-back`) with scaleX progress fills; `Burst` (`src/components/ui/Burst.tsx`, small/large) fires on saving a store (store page + list hearts) and liking a post; tapping a map cluster eases in over 0.7s and the split pins drop in; `BadgeCelebration` (mounted in `layout.tsx`) shows a confetti "Badge unlocked" card for badges earned since this device last looked — checked 2.5s after app open (once per session) and on the `check-badges` event the report success screen fires; the first check per device only records a baseline (`localStorage.badges_seen_v1:<uid>`). Landing hero (`landing.module.css`): staggered copy entrance, phone fades up then floats, pins drop in one by one, cluster + store card follow, card rows stagger, fresh dot and the "you" halo pulse.

### Welcome Flow & Preferences

First sign-in shows `src/components/onboarding/Onboarding.tsx` (mounted from `MapHome` once location is resolved; replaces the old one-screen tips sheet): a **Welcome to AmpedMap** intro screen (first time only, four feature cards), then four skippable steps — favorite brands, flavors to follow (upserts `drink_alerts` with scope `anywhere`), store types + optional home ZIP/location, "want to help?" (choosing "Yes, show me how" adds a **How reporting works** walkthrough with drawn mini-screens of the at-store banner, the FULL/MED/LOW/OUT buttons and the success screen) — then a finish screen with a personalized line from real nearby data and, for helpers, "Report at [nearest store]" only when that store is within ~0.3 mi (reports are geofenced to 500 m) — otherwise a tip about the "You're at…" banner. Reopened in edit mode from Account → **Your preferences**. Answers live in `usePreferences()` (`src/lib/preferences.ts`): saved to `profiles` (`favorite_brands`, `store_types`, `home_zip`, `home_lat`, `home_lng`, `wants_to_report`, `onboarded_at` — `scripts/onboarding-preferences.sql`, not yet confirmed run) and always mirrored to localStorage, so it works before the migration (per device). How answers are used: favorite brands sort first on store pages and in store-card flavor chips, and power the map's **My brands** chip (highlights stores carrying them, via the same dimming as drink search); home lat/lng becomes `manualLocation` when there's no GPS fix (skipping the location prompt) and the Community/leaderboard "Near me" fallback; a single chosen store type becomes the map's default type filter.

### Analytics

Vercel Web Analytics (`<Analytics />` from `@vercel/analytics/next` in `layout.tsx`) records cookieless page views; it must also be enabled in the Vercel dashboard (project → Analytics) to collect anything. Custom events need a paid Vercel plan, so the signup funnel is read from page views: `/` → `/account?mode=signup` → back to `/` signed in. Disclosed in the Privacy Policy's service-provider list.

### Layout Shell

`ContentShell` (`src/components/ContentShell.tsx`) wraps the main column and only adds the desktop `md:ml-[220px]` sidebar offset when a user is signed in — `SideNav` doesn't render for logged-out visitors, so the landing and sign-in pages use the full width instead of leaving an empty strip.

### Theming

**Dark is the default; light mode is opt-in** (added 2026-11-14) from Account → **Appearance** (Dark / Light / Match my phone), saved per device in `localStorage.ampedmap_theme`. `ThemeContext.tsx` sets `<html data-theme="light">` (and the `theme-color` meta) only while signed in — landing, sign-in and waitlist pages always stay dark — and the inline script in `layout.tsx` applies it before first paint so there's no dark flash. Light values live in `html[data-theme="light"]` in `globals.css`: the `--fg-*` series flips to black alphas, and **`--accent` stays the lime fill (buttons, active chips) while `--accent-text` is lime in dark but olive (#4E6600) in light** — use `var(--accent-text)` for any lime text or icon color, `var(--accent)`/`#C9F400` only for fills, borders, tints and status dots (map pins stay lime in both). `MapView` swaps between recolored `dark-v11` / `light-v11` styles (`MAP_THEME`) live via `setStyle`. Never hard-code dark hexes for text/surfaces (use `--text*`, `--surface*`, `--input-bg`, `--placeholder`); `.text-white` is remapped to `--text` in light for the few older screens that use it. Everything below describes the shared visual language, which applies to both themes. The visual language follows the landing page: one lime accent (`--accent`) reserved for the primary action and active states, neutral borders (`--border` is a white alpha, not lime), sentence-case text (no all-caps condensed labels, no glows or grid backgrounds), and contrast-safe grays — `--text-muted` (#A4B0A6) and `--text-dim` (#7E8A80); never hard-code the old #4A5F50/#7A8F80. Shared building blocks live in `src/components/ui/ui.module.css` (`btnPrimary`/`btnSecondary`/`btnGhost`, `chip`/`chipActive`/`chipRow`, `segmented`/`segment`, `input`, `card`, `sectionLabel`, `iconBtn`, `linkQuiet`, `emptyState`) — reach for these instead of restyling inline. One primary (lime) button per card/screen. The whole app has been restyled to this language (landing, sign-in/up, Map, store page, Report Stock + success, Add store, Community, Notifications, Saved stores, Account, nav, Admin). Intentional exceptions: the FULL/MED/LOW/OUT status pills and brand/drink accents keep their colors, the Community highlighted-post ring, and the collectible emoji listed under "Deliberately left as emoji". Tab pages use a plain 30px/700 title (no half-lime split words). CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, `--fg-*` alpha series, etc.) drive all colors and are defined in `src/app/globals.css`. `ThemeContext.tsx` is a no-op stub kept for import compatibility.

### Badge System

19 badges defined in `BADGE_DEFS` in `src/lib/badges.ts` (shared by Account, profiles and the landing page). **Founding Hunter** (`founding_hunter`, 🎖️) goes to every account created before `FOUNDING_CUTOFF` (2027-01-01; `isFoundingMember()`), computed from the join date in both `computeBadges()` and Account's own computation; it is no longer advertised on the landing page. Change the date in one place: `FOUNDING_CUTOFF` / `FOUNDING_CUTOFF_LABEL`. Most are computed client-side on page load from stats (report count, store count, unique drinks, streak, report timestamps). Two exceptions:
- `verified` — read from `profiles.is_verified_reporter` (admin-toggled)
- `weekly_champion` — read from `profiles.badges` (text[] column), assigned by the weekly cron function

`/account` → **Badges** shows all badges in earned-first order.

### Automations

Three Supabase automations in `scripts/automation-*.sql` — run each once in the Supabase SQL Editor to activate:

| Script | Trigger | Schedule |
|---|---|---|
| `automation-weekly-champion.sql` | Assigns 👑 badge + notification to top reporter | Every Monday 00:00 UTC (pg_cron) |
| `automation-badge-notifications.sql` | Fires in-app notification on report/drink/store milestones | DB trigger on `stock_reports` INSERT + `stores` UPDATE |
| `automation-stale-cleanup.sql` | Deletes non-latest reports older than 7 days (90 days once `tracker-features.sql` has replaced the function) | Every night 03:00 UTC (pg_cron) |

Requires pg_cron (enabled by default on Supabase Pro).

### Notifications & Nav Icons

Notifications have their own bottom-nav tab (**Alerts**, `/notifications`) rather than a header bell icon — `NotificationBell.tsx` was removed. `src/hooks/useUnreadNotifications.ts` holds the shared unread-count fetch + real-time subscribe logic (previously inside `NotificationBell`), used by both `BottomNav.tsx` (mobile) and `SideNav.tsx` (desktop) so the badge count works identically on both without duplicating the Supabase query. It subscribes to both `INSERT` and `UPDATE` on `notifications` and re-fetches the exact unread count on any change, rather than incrementing locally — needed because read state is now explicit (see below), not something the hook can infer just from visiting the page.

Nav icons are custom inline SVGs (`src/components/NavIcons.tsx`) instead of system emoji — emoji rendered with mismatched weights across devices (some bold/colorful like 👥🔔, some thin/monochrome like 🗺️). Each icon takes an `active` boolean: active renders a solid lime fill, inactive a gray outline, matching the lime-for-active convention used elsewhere (toggle buttons, active filter chips). The Alerts icon carries the unread-count badge as a small red circle positioned over the bell SVG. Notification cards use a sibling set, `src/components/NotificationIcons.tsx` — same lime line-icon language, no active/inactive state needed — via a `notificationIcon(type)` lookup with a bell fallback for unmapped types.

The `/notifications` page (redesigned 2026-11-14):
- **Cards grouped by day** (2026-11-15: each notification is its own compact card in the style of the old Community activity cards — 30px icon tile with an unread dot, 14px message, lime tint when unread; grouped stock updates list their lines as chips; stock levels in the text keep the report-card colors: Full and "back in stock" lime, Medium/Low amber, Out red). The Account profile card says "View profile". Previously iOS-style rows (Today / Yesterday / weekday / "Month D") inside one card per day. Each row: unread dot, icon tile (lime-tinted when unread), message (bold when unread; the leading emoji some DB triggers prepend is stripped since the icon carries the type), "Store · 2h" meta, chevron when it links somewhere.
- **Tap = mark read + go there** (`hrefFor()`): store page when `store_id` is set, `/community?post=` for `post_id`, `/account?page=badges` for badges, `/account?page=alerts` for drink alerts. `/account` honors `?page=badges|alerts|plan` as a deep link (Back returns to the Account list).
- **Explicit read state** — visiting doesn't mark anything read; "Mark all read" in the header marks every unread row for the user server-side.
- **Grouped stock updates** — consecutive same-store, same-day `stock_update` rows collapse into one ("N stock updates at Store", first 3 sub-lines + "+N more"). Sub-lines reuse each notification's raw `message`, since the `notify_stock_update` RPC (called from `/api/stock/report`) was created in the Supabase dashboard and its wording isn't defined in this repo.
- **Filters**: All / Unread (with count) / Stock (`stock_update`, `drink_alert`) / Community (`comment`, `reply`, `mention`, `follow`) / Stores & drinks / Badges — the `CATEGORY` map in `src/app/notifications/page.tsx`. Add new notification types there and in `NotificationIcons.tsx`.
- Pages 40 at a time ("Load older notifications" by `created_at` cursor), refreshes live on realtime INSERTs. **Clear all** sits in the header next to Mark all read, behind a confirmation sheet, and deletes through `POST /api/notifications/clear` (service role).
- **Drink names glow by the reported level**: stock messages are plain text from DB triggers/RPCs whose wording isn't in this repo, so the page asks `POST /api/notifications/stock-details` (service role, caller's own notifications only) for the reports made at each notification's store within ±3 min of it — the actual flavors and levels. Flavor names in the text (matched against the drinks catalog) take their exact reported level; failing that, the nearest level word. Reported flavors the text doesn't name ("+2 more") are listed as level-colored chips underneath. Lime / amber / red with a soft glow, dropped in light mode via `.lvl-glow`.
- **New follower**: `/api/community/follow` sends a `follow` notification ("@name started following you") on a new follow, at most once per follower per 24h; tapping it opens `/u/name`.

### App-Wide Icon System

`src/components/Icons.tsx` is a general-purpose line-icon library (heart/favorite, flag/report, search, checkmark, clock, map pin, close/x, info, chevrons, directions, bell, drink cup, lightning/report-stock, comment, user(s), clipboard, trophy, trending, camera, and the four store-type icons) in the same visual language as the tab bar: 24×24 viewBox, 1.6–1.8px stroke, rounded caps/joins, no fill unless `filled`/active. It's the third icon file alongside `NavIcons.tsx` (tab bar, fixed active/inactive convention) and `NotificationIcons.tsx` (notification cards, fixed size) — `Icons.tsx` is the one to reach for anywhere else, since its components take `size`/`color` props instead of being hardcoded for one context.

This replaced standalone emoji used as functional UI icons app-wide (search boxes, favorite/flag buttons on the store page, store-type markers on the map and every store list, filter chips, admin dashboard tiles, close/dismiss buttons, confirm-vote ✓/✗ buttons, the drink-alert bell, the primary "Report Stock" / "Submit Report" CTAs, and the Community/Leaderboard sub-tabs, filter chips, photo-attach button, and "How Points Work" list) — emoji rendered with mismatched weights and colors across devices, the same problem the nav bar icons were built to fix. `storeTypeIconSvg()` is a raw-HTML-string twin of `StoreTypeIcon` for `MapView.tsx`, which builds Mapbox markers via `innerHTML` rather than JSX; map pin icons are tinted with the same freshness color (lime/amber/gray) as the marker's border and glow, so the icon itself carries the freshness signal rather than sitting on top of it in a neutral color.

**Deliberately left as emoji** (not converted): thematic/collectible icons that are a different, intentionally colorful visual language rather than functional UI chrome — the 18-badge catalog (`BADGE_DEFS` in `src/app/account/page.tsx`), pricing-tier icons (`TIERS`), the "How it works" marketing panels (the waitlist page's feature list), the Leaderboard's 🥇🥈🥉 rank medals and 👑 weekly-champion badge (same "collectible achievement" category as the badge catalog), one-off settings-menu icons with no equivalent in the shared set (edit, key, document, lock, logout, trash), and big decorative splash-screen icons on `/offline`, `/error`, `/submit`, `/admin/login`. Also left alone: plain punctuation glyphs used for chevrons (`‹` `›`) and back-arrows (`←`), which don't have the cross-device color/weight mismatch problem emoji do, since they already render as thin monochrome text.

### Flavor Alerts

"Follow a flavor" — a user taps the 🔔 bell on any drink card (store page) to get notified the next time it genuinely restocks. Defined in `scripts/create-drink-alerts-tables.sql` (not yet run against production as of this writing).

- **In-app for everyone, push for Tracker** — every alert lands in the Alerts tab; Tracker members can also turn on phone push (see "Tier System").
- **Free accounts follow up to 5 flavors**; Tracker is unlimited (see "Tier System" for where it's enforced). Every scope is available on both plans.
- **One alert per user+drink** (`drink_alerts`, `UNIQUE(user_id, drink_id)`) — tapping an inactive bell opens a scope-picker sheet (This store only / Within N miles / Anywhere); tapping an active bell unfollows immediately, no sheet, since following needs a scope decision but unfollowing doesn't. Radius scope anchors to the *store's* lat/lng at the time the alert was created (not the user's live location), so the "in range" set stays meaningful after they leave.
- **Restock detection is a DB trigger** (`notify_drink_alert_subscribers()`, same pattern as `automation-badge-notifications.sql`), firing `AFTER INSERT ON stock_reports`. Only fires on a genuine transition into stock — the new report isn't `'out'`, and the prior report for that store+drink (if any) was `'out'`. A same-state re-report (already in stock, reported again) deliberately does not notify.
- Only a **single unified alert** exists per drink — no separate "notify on brand-wide new drops" toggle. That's a different data shape (brand-level, not drink-level) and was scoped out of this pass.
- No "Rare Find" auto-tagging (flavors with a history of low stock) — would need report-history data that's currently only fetched on-demand for `tracker` users, not eagerly for everyone.
- Managed from `/account` → **Flavor Alerts** (not a separate nav tab, to avoid crowding the bottom nav).
- **"Follow a flavor" search** (same Flavor Alerts page) — the bell on a store's stock card only ever covers drinks currently in stock *somewhere nearby*, so there was no way to start an alert for something with zero current stock anywhere (a discontinued/rare flavor, by definition, usually has none). This box searches the full `drinks` catalog directly (brand/name/flavor, debounced 300ms) regardless of current stock, and follows immediately at `scope: 'anywhere'` — no store context to anchor "within N miles" or "this store only" against, so those two scopes aren't offered here, only via the store-page bell. Reuses the exact same `drink_alerts` upsert (`onConflict: 'user_id,drink_id'`) and restock trigger as the store-page flow; no new schema.

### Stock Report Accuracy

Stock reports on store pages show a freshness state based on age:
- **Fresh** — reported < 1 day ago (thresholds: `src/lib/freshness.ts`, changed from 2h/12h/24h on 2026-11-15)
- **Aging** — 1–2 days ago
- **Stale** — 2–3 days ago
- **Unverified** — 3+ days ago (greyed out)

All users see the freshness label; `tracker` tier users additionally see the exact time ago. Each drink card also shows a small lime/amber/gray status dot next to the flavor name — the same simplified fresh(< 1 day)/stale/never-reported signal used for Report Stock's flavor rows and the map's marker freshness, layered on top of the more precise 4-bucket text label rather than replacing it.

Community ✓/✗ confirmation voting on individual drink cards was removed — freshness now rests on the timestamp and status dot alone. The `stock_confirmations` table and `POST /api/stock/confirm` route still exist but are currently unused/orphaned; left in place rather than deleted in case the feature comes back, not an oversight.

The tracker-only "Report History" expandable panel (tap a drink card → timeline of past reports with quantity/time/reporter) was also removed — drink cards are no longer tappable at all. Removed the marketing claims for it too ("Full drink report history" / "Report history" bullets on the pricing cards in `src/app/account/page.tsx`, and community's tracker upsell banner in `src/app/community/page.tsx`, which promised "history" as a Tracker perk) so the plans don't advertise something that no longer exists.

### Report Stock Flow

`/submit/drinks` (restyled 2026-11-14 to the store-page look): a one-line instruction, search, then **At this store** — brands with any `latest_stock` report at this store (plus every other catalog flavor of those brands, since a store carrying a brand plausibly carries unreported flavors; reported flavors first). Brand cards collapse/expand (auto-open when ≤ 2 brands) and every flavor row, in every section, is the same: name, "Last: Full · 2h ago" / "No reports yet", and a Full / Med / Low / Out button row (store-page `LEVEL` colors; tap again to clear). Other brands sit behind a "See something else? Show all brands" button (shown directly as **All brands** when the store has no reports). Searching shows matching brands, all open. The sticky bottom bar (only with picks) shows the location status, errors, **Clear** and **Submit N reports**. The success screen (`/submit/result`) is deliberately just a confirmation — ✓, count, thanks, Done / Report more flavors / View store — and no longer lists the store's current stock.

The store page's Add Drink success screen has a "Report Stock" button (alongside "Done") that jumps straight to `/submit/drinks` for that store, so adding a new flavor and then reporting it in stock is a continuous flow rather than a dead end.

Barcode scanning was built and then removed (was briefly on `/submit/drinks` — camera scan via `@zxing/browser`, matching against `drinks.kroger_upc` with an Open Food Facts fallback for unrecognized codes). Not wanted; pulled entirely, including the `@zxing/browser`/`@zxing/library` deps and the `Drink.kroger_upc` client type field added to support it.

### Geofencing & Submission Limits

Stock report submission (`/submit/drinks`) posts to `/api/stock/report`, which enforces everything **server-side** using the caller's bearer token (the client's own Haversine check is just a UX hint — a status message shown before submitting — not the actual enforcement):
- **500m geofence** around the target store. If GPS is unavailable, the check is skipped and submission is still allowed. Admins bypass it entirely.
- **25 reports/day limit** — applies to both `free` and `tracker` tiers; only admins are unlimited.
- **30-minute same-drink dedup** — applies to `free` tier only; `tracker`/admin can re-report the same drink at the same store without waiting.

`/submit/drinks` only auto-requests GPS if the Permissions API reports it's already `granted` (same pattern as `useLocation.ts`) — a user who hasn't decided yet, or already denied, never gets a surprise permission prompt just for opening this page. When skipped, the footer shows a reassuring "Reporting without location — that's okay, it still counts" line with an optional "Verify my location" link that triggers the request on tap. This is deliberately consistent with the server behavior above: no GPS was ever a silent allow, not a block — the client now just stops pushing for it upfront too.

A submission where every pick was deduped returns `{ submitted: 0 }`; the client shows an "already reported" message rather than the success screen in that case.

**Undo (5 minutes).** `/api/stock/report` returns the inserted `ids`; `/submit/drinks` stashes them in `sessionStorage.last_report` and the success screen shows "Made a mistake? Undo (m:ss)", which calls `POST /api/stock/undo` — deletes only the caller's own reports and only within 5 minutes (+30 s grace). `latest_stock` then falls back to the previous report. Notifications the report already fired (restock alerts, stock updates, badge triggers) are not pulled back.

**Offline reports.** If the phone has no signal (`navigator.onLine` false, or the fetch fails with a network error), `/submit/drinks` saves the picks with the GPS fix from that moment to `localStorage.pending_stock_reports_v1` (`src/lib/reportQueue.ts`) and shows a "N reports saved" screen in place (no navigation, since the next route's code may not be cached offline), with its own Undo that just removes it from the queue. `ReportQueueSync` (mounted in `layout.tsx`) sends the queue on app open, on the `online` event and when the app returns to view, then toasts "N saved reports sent". The server applies the usual geofence/limit/dedup at send time; refusals are dropped with a toast, transient failures (401, 5xx, per-minute rate limit) stay queued, and anything older than 6 hours is discarded rather than sent. `reported_at` is the send time, not the moment it was saved.

**Haptics.** `haptic()` (`src/lib/haptics.ts`) gives a light buzz on each Full/Med/Low/Out tap and a double pulse on send/save. Android only — iOS Safari has no web vibration API (the planned Capacitor app would use `@capacitor/haptics`); skipped under reduced motion.

### Location (iOS Safari)

`src/hooks/useLocation.ts` checks the Permissions API before auto-requesting geolocation. If permission is already `granted`, it requests immediately on mount. Otherwise it waits for a user tap (required for iOS Safari). The initial map screen shows an "Enable Location" button to trigger the first request via user gesture.

**ZIP code fallback**: both location-blocked screens ("Enable Location" and "Location Access Needed"/"Unable to Get Location") also offer a ZIP code search, for users unwilling to grant live GPS access to a new site. Reuses the existing `/api/geocode` route (same one `/add-store` uses for street addresses — Census primary, Nominatim fallback) with just the ZIP as the query string; both geocoders resolve a bare 5-digit ZIP fine. The resulting lat/lng is stored in `manualLocation` state and takes over as the effective location everywhere on the page (`lat`/`lng` prefer `manualLocation` over live GPS) — it's a full substitute, not just a one-time search, so `/api/stores/nearby` and everything downstream behaves identically to a live GPS fix. Deliberately doesn't affect `/submit/drinks`'s own geofence check, which requests its own independent GPS fix at report time regardless of how the user got to the store page.

### PWA

Manifest generated at `src/app/manifest.ts`. Service worker registered via `src/components/ServiceWorkerRegister.tsx`. Offline fallback page at `/offline`.

## Future Considerations

Ideas discussed but deliberately not started — parked here instead of lost between sessions.

### Retailer POS Integration (not started)

Explored as a fourth stock-data source, alongside crowd reports (`stock_reports`), the since-removed Kroger integration, and a not-yet-built retailer self-report option (see below). The question that kicked this off: how could a gas station or retailer mark their own stock, either automatically via their point-of-sale system or manually.

**Two approaches discussed:**

1. **Owner self-report** (cheap, not built) — a retailer claims their store (email/phone verification or admin approval, similar to Google Business Profile), then uses the *existing* `/submit/drinks` Report Stock flow from an account flagged as that store's verified owner, distinguished by a new badge (analogous to the Kroger "Verified" badge, but human-sourced). Needs roughly a `store_owners` table (`user_id` + `store_id` + verified flag), a claim/verify flow, and one new badge — reuses essentially all of the existing report pipeline. Same staleness risk as any manual source, just from a more authoritative person.

2. **Direct POS integration** (expensive, not built) — same architectural shape as the Kroger integration (a separate `pos_stock`-style table, never merged into `stock_reports`; a store-to-POS-location mapping column like `stores.kroger_location_id`; a suggest-and-confirm SKU-to-`drinks`-row matching step like Kroger drink matching) but push-based via webhooks instead of Kroger's polled/cron sync, so genuinely real-time with precise unit counts rather than coarse High/Med/Low. Would need to be built per POS vendor (Square, Clover, Toast, NCR, etc. are all separate integrations — no universal POS API), starting with Square as the most likely first target given how common it is among independent convenience stores/gas stations.

**Why this is parked, not scoped for work yet:** the real blocker isn't engineering effort, it's whether the data exists to pull at all — a large share of small convenience stores and gas stations run their register as pure payment-taking with no real per-SKU inventory tracking behind it. POS integration also needs actual business development (a retailer has to be talked into connecting their POS account; doesn't scale the way crowd reporting or self-serve owner claims do), and ongoing per-retailer maintenance (token refresh, revoked access, missed webhooks). Before investing engineering time, worth a gut-check with a handful of real gas stations/convenience stores on whether their POS even tracks inventory — otherwise this risks Kroger's integration effort without Kroger's guarantee the data is there.

### Limited-Edition Drop Tracker & Discontinued/Vault Watchlist

Two ideas that turned out to be one shared system plus one already-existing feature, rather than two separate builds:

- **Drop Tracker** (not started) — a curated feed of confirmed/rumored seasonal or limited-edition flavors (e.g. a Halloween "Witch's Brew," a returning Ghost collab, a new Red Bull edition), so users know what to hunt for before it's even reached stores. Needs a new admin-curated content table (status: rumored/confirmed/released, description, maybe a source link) plus a display surface — no store or Kroger data can tell you this, it has to be entered by a person.
- **Discontinued/vault watchlist** (**restock half now built**, announcement half not started) — let a user flag a discontinued favorite and get notified either when a store reports it back in stock, or when the brand announces a return. The first trigger is just Flavor Alerts (`drink_alerts` + `notify_drink_alert_subscribers()`) — already existed, the only gap was *discovery* (no way to follow a flavor with zero current stock anywhere). That gap is now closed by the "Follow a flavor" search on `/account` → Flavor Alerts — see "Flavor Alerts" above. The second trigger ("brand announces a return") still needs the same new curated-content table the Drop Tracker needs, since that's editorial information no data source has.

**Why the remaining piece is parked:** unlike everything else in the app (crowd-sourced or API-synced), a curated drops/announcements feed needs an ongoing human editor to keep researching and posting rumors/confirmations indefinitely, or the feed goes stale fast — a genuinely different kind of ongoing cost than anything else here, worth being deliberate about taking on before building the table and UI for it.

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
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED # Optional — set to "true" to show "Continue with Google" (requires Google enabled under Supabase Auth → Providers)
NEXT_PUBLIC_DISCORD_URL        # Optional — Discord invite link; turns on the landing page Discord card
INTERNAL_API_SECRET            # Required — shared secret for server-to-server calls (e.g. Stripe webhook → /api/email/welcome)
NEXT_PUBLIC_VAPID_PUBLIC_KEY   # Web push public key (Tracker restock notifications)
VAPID_PRIVATE_KEY              # Web push private key — server only
VAPID_SUBJECT                  # Web push contact, e.g. https://ampedmap.com
```
