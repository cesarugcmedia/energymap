import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { sendPush, trackerIds, pushConfigured } from '@/lib/push'
import { isMissingSchema } from '@/lib/community'
import { legacyQuantity, type Amount, type Sighting } from '@/lib/sightings'
import { BOUNTY_AFTER_HOURS, BOUNTY_DAILY_CAP, XP_BOUNTY, XP_SIGHTING, plugFrom, weekStartUtc } from '@/lib/xp'

// POST /api/stock/report — saves community sightings for one store.
// Body: { store_id, reports: [{ drink_id, sighting: 'spotted' | 'not_there',
// amount?: 'few' | 'plenty' | null }], lat?, lng? }. Reports in the old
// { drink_id, quantity } shape (offline reports saved by an older app
// version) are still accepted and converted.
//
// Enforced here: 500 m geofence (skipped without GPS, admins exempt), 25 a
// day (admins exempt), and the 30-minute same-flavor wait for free accounts,
// which applies to both Spotted and Not there.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_DISTANCE_M = 500
const DAILY_LIMIT = 25
const DEDUP_WINDOW_MS = 30 * 60 * 1000
// "Spotted nearby" notifications: at most one per reporter per store per 10 min.
const NOTIFY_WINDOW_MS = 10 * 60 * 1000

type Incoming = { drink_id?: string; sighting?: string; amount?: string | null; quantity?: string }
type Clean = { drink_id: string; sighting: Sighting; amount: Amount | null }

function clean(r: Incoming): Clean | null {
  if (!r?.drink_id || typeof r.drink_id !== 'string') return null
  if (r.sighting === 'spotted' || r.sighting === 'not_there') {
    const amount = r.sighting === 'spotted' && (r.amount === 'few' || r.amount === 'plenty') ? r.amount : null
    return { drink_id: r.drink_id, sighting: r.sighting, amount }
  }
  // Older app versions: full / medium / low / out.
  switch (r.quantity) {
    case 'out': return { drink_id: r.drink_id, sighting: 'not_there', amount: null }
    case 'full': return { drink_id: r.drink_id, sighting: 'spotted', amount: 'plenty' }
    case 'medium':
    case 'low': return { drink_id: r.drink_id, sighting: 'spotted', amount: 'few' }
    default: return null
  }
}

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(`report:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const { store_id, reports: raw, lat, lng } = body as { store_id?: string; reports?: Incoming[]; lat?: number; lng?: number }
  if (!store_id || !Array.isArray(raw) || raw.length === 0 || raw.length > 50) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const reports = raw.map(clean)
  if (reports.some((r) => !r)) {
    return NextResponse.json({ error: 'Invalid report entries' }, { status: 400 })
  }
  const valid = reports as Clean[]

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username, tier, is_admin')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.is_admin ?? false
  const isTracker = isAdmin || profile?.tier === 'tracker'

  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('lat, lng, name')
    .eq('id', store_id)
    .single()
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  // Geofence — skipped for admins, and when the client couldn't get GPS.
  if (!isAdmin && typeof lat === 'number' && typeof lng === 'number') {
    if (getDistanceMeters(lat, lng, store.lat, store.lng) > MAX_DISTANCE_M) {
      return NextResponse.json({ error: 'You need to be at the store to log a sighting.' }, { status: 403 })
    }
  }

  // Daily limit — everyone except admins.
  if (!isAdmin) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabaseAdmin
      .from('stock_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('reported_at', todayStart.toISOString())
    if ((count ?? 0) + valid.length > DAILY_LIMIT) {
      const left = Math.max(0, DAILY_LIMIT - (count ?? 0))
      return NextResponse.json(
        { error: left === 0 ? `You've reached today's limit of ${DAILY_LIMIT} sightings.` : `Only ${left} more sighting${left === 1 ? '' : 's'} today.` },
        { status: 429 }
      )
    }
  }

  // Recent reports by this user at this store: drives the free-account
  // 30-minute wait (Spotted and Not there alike) and the notify throttle.
  const { data: recent } = await supabaseAdmin
    .from('stock_reports')
    .select('drink_id, reported_at')
    .eq('user_id', user.id)
    .eq('store_id', store_id)
    .gte('reported_at', new Date(Date.now() - Math.max(DEDUP_WINDOW_MS, NOTIFY_WINDOW_MS)).toISOString())
  const dedupSince = Date.now() - DEDUP_WINDOW_MS
  const recentIds = new Set((recent ?? []).filter((r) => new Date(r.reported_at).getTime() >= dedupSince).map((r) => r.drink_id))
  const notifiedLately = (recent ?? []).some((r) => new Date(r.reported_at).getTime() >= Date.now() - NOTIFY_WINDOW_MS)

  // One report per flavor per request; free accounts skip flavors they
  // reported here in the last 30 minutes.
  const seen = new Set<string>()
  const toSubmit = valid.filter((r) => {
    if (seen.has(r.drink_id)) return false
    seen.add(r.drink_id)
    return isTracker || !recentIds.has(r.drink_id)
  })
  if (toSubmit.length === 0) {
    return NextResponse.json({ submitted: 0, waited: valid.map((r) => r.drink_id) })
  }

  const { data: drinks } = await supabaseAdmin
    .from('drinks')
    .select('id, name, brand, flavor')
    .in('id', toSubmit.map((r) => r.drink_id))
  const drinkById = new Map((drinks ?? []).map((d) => [d.id, d]))

  // Flavor collection: which spotted flavors has this person never found?
  // flavor_finds (profile-v2) when it exists, else their surviving reports.
  const spottedIds = [...new Set(toSubmit.filter((r) => r.sighting === 'spotted').map((r) => r.drink_id))]
  let alreadyFound = new Set<string>()
  let hasFindsTable = false
  if (spottedIds.length) {
    const ff = await supabaseAdmin.from('flavor_finds').select('drink_id').eq('user_id', user.id).in('drink_id', spottedIds)
    if (!ff.error) {
      hasFindsTable = true
      alreadyFound = new Set((ff.data ?? []).map((r) => r.drink_id))
    } else {
      const { data: prior } = await supabaseAdmin.from('stock_reports').select('drink_id, sighting, quantity')
        .eq('user_id', user.id).in('drink_id', spottedIds)
      alreadyFound = new Set((prior ?? []).filter((r: { sighting?: string | null; quantity?: string | null }) => (r.sighting ?? (r.quantity === 'out' ? 'not_there' : 'spotted')) === 'spotted').map((r) => r.drink_id))
    }
  }
  const newFlavorIds = spottedIds.filter((id) => !alreadyFound.has(id))

  // Bounty: the first sighting at a store nobody has checked in
  // BOUNTY_AFTER_HOURS (or ever) earns XP_BOUNTY — at most BOUNTY_DAILY_CAP
  // a day per person. Needs stock_reports.bounty_xp (scripts/xp-bounties.sql).
  let bounty = 0
  const { data: lastHere } = await supabaseAdmin.from('stock_reports').select('reported_at')
    .eq('store_id', store_id).order('reported_at', { ascending: false }).limit(1)
  const lastAt = lastHere?.[0]?.reported_at ?? null
  if (!lastAt || Date.now() - new Date(lastAt).getTime() >= BOUNTY_AFTER_HOURS * 3600000) {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const claimed = await supabaseAdmin.from('stock_reports').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gt('bounty_xp', 0).gte('reported_at', dayStart.toISOString())
    if (!claimed.error && (claimed.count ?? 0) < BOUNTY_DAILY_CAP) bounty = XP_BOUNTY
  }

  // Restock alerts are written by a DB trigger during this insert; anything
  // newer than this moment for this store is from this report.
  const insertStartedAt = new Date(Date.now() - 2000).toISOString()
  const rowsFor = (withBounty: boolean) => toSubmit.map((r, i) => ({
    store_id, drink_id: r.drink_id, user_id: user.id, sighting: r.sighting, amount: r.amount,
    ...(withBounty && bounty && i === 0 ? { bounty_xp: bounty } : {}),
  }))
  let ins = await supabaseAdmin.from('stock_reports').insert(rowsFor(true)).select('id, drink_id')
  if (ins.error && isMissingSchema(ins.error) && bounty) {
    // xp-bounties.sql not run yet: no bounty column.
    bounty = 0
    ins = await supabaseAdmin.from('stock_reports').insert(rowsFor(false)).select('id, drink_id')
  }
  if (ins.error && isMissingSchema(ins.error)) {
    // scripts/sightings.sql not run yet: store as the old level for now.
    ins = await supabaseAdmin.from('stock_reports').insert(
      toSubmit.map((r) => ({ store_id, drink_id: r.drink_id, user_id: user.id, quantity: legacyQuantity(r.sighting, r.amount) }))
    ).select('id, drink_id')
  }
  if (ins.error) {
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }

  // "Spotted nearby" notification — Spotted only, once per 10 min per store.
  const firstSpotted = toSubmit.find((r) => r.sighting === 'spotted')
  if (firstSpotted && !notifiedLately) {
    const d = drinkById.get(firstSpotted.drink_id)
    const label = d ? (d.flavor ? `${d.brand} ${d.flavor}` : d.name) : 'a drink'
    after(async () => {
      const r = await supabaseAdmin.rpc('notify_sighting', { p_store_id: store_id, p_drink_name: label, p_reporter_id: user.id })
      if (r.error && profile?.username) {
        // Before scripts/sightings.sql: the old notifier.
        await supabaseAdmin.rpc('notify_stock_update', { p_store_id: store_id, p_drink_name: label, p_quantity: 'spotted', p_reporter_username: profile.username })
      }
    })
  }

  // Tracker push: mirror this report's restock alerts to subscribers' phones.
  if (pushConfigured() && spottedIds.length) {
    after(async () => {
      const { data: alerts } = await supabaseAdmin.from('notifications')
        .select('user_id, message')
        .eq('type', 'drink_alert')
        .gte('created_at', insertStartedAt)
        .ilike('message', `%${store.name}%`)
      if (!alerts?.length) return
      const trackers = await trackerIds(supabaseAdmin, [...new Set(alerts.map((a) => a.user_id))])
      await sendPush(supabaseAdmin, alerts.filter((a) => trackers.has(a.user_id)).map((a) => ({
        userId: a.user_id,
        payload: {
          title: 'Spotted!',
          body: String(a.message ?? '').replace(/^(\p{Extended_Pictographic}|️|\s)+/u, ''),
          url: `/store/${store_id}`,
          tag: `restock-${store_id}`,
        },
      })))
    })
  }

  // Collection progress ("New flavor! 48 of 212").
  let collection: { newFlavors: string[]; found: number; total: number } | null = null
  if (newFlavorIds.length) {
    try {
      const [{ count: total }, found] = await Promise.all([
        supabaseAdmin.from('drinks').select('id', { count: 'exact', head: true }),
        hasFindsTable
          ? supabaseAdmin.from('flavor_finds').select('drink_id', { count: 'exact', head: true }).eq('user_id', user.id).then((r) => r.count ?? 0)
          : supabaseAdmin.from('stock_reports').select('drink_id, sighting, quantity').eq('user_id', user.id).limit(5000)
              .then((r) => new Set((r.data ?? []).filter((x: { sighting?: string | null; quantity?: string | null }) => (x.sighting ?? (x.quantity === 'out' ? 'not_there' : 'spotted')) === 'spotted').map((x) => x.drink_id)).size),
      ])
      collection = {
        newFlavors: newFlavorIds.map((id) => drinkById.get(id)).filter(Boolean).map((d) => `${d!.brand} ${d!.flavor || d!.name}`),
        found,
        total: total ?? 0,
      }
    } catch { /* nice-to-have */ }
  }

  const rows = (ins.data ?? []) as { id: string; drink_id: string }[]

  // Plug: most sightings at this store this week (after this one).
  let plug = null
  try {
    const { data: week } = await supabaseAdmin.from('stock_reports').select('user_id, reported_at')
      .eq('store_id', store_id).gte('reported_at', weekStartUtc().toISOString()).range(0, 1999)
    plug = plugFrom(week ?? [], user.id, (id) => (id === user.id ? profile?.username ?? null : null))
    if (plug.plugId && !plug.isPlug) {
      const { data: lp } = await supabaseAdmin.from('profiles').select('username').eq('id', plug.plugId).maybeSingle()
      plug = { ...plug, plugName: lp?.username ?? null }
    }
  } catch { /* nice-to-have */ }

  return NextResponse.json({
    xp: rows.length * XP_SIGHTING + bounty,
    bounty,
    plug: plug ? { ...plug, plugId: undefined } : null,
    submitted: rows.length,
    ids: rows.map((r) => r.id),
    // Which report id belongs to which flavor (for Undo and adding an amount).
    byDrink: Object.fromEntries(rows.map((r) => [r.drink_id, r.id])),
    waited: valid.filter((r) => !toSubmit.includes(r)).map((r) => r.drink_id),
    collection,
  })
}
