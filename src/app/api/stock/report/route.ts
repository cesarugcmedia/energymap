import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import type { Quantity } from '@/lib/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_DISTANCE_M = 500
const DAILY_LIMIT_FREE = 25
const DEDUP_WINDOW_MS = 30 * 60 * 1000
const VALID_QUANTITIES: Quantity[] = ['out', 'low', 'medium', 'full']

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
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(`report:${user.id}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const { store_id, reports, lat, lng } = body as {
    store_id?: string
    reports?: { drink_id: string; quantity: Quantity }[]
    lat?: number
    lng?: number
  }

  if (!store_id || !Array.isArray(reports) || reports.length === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (!reports.every((r) => r?.drink_id && VALID_QUANTITIES.includes(r.quantity))) {
    return NextResponse.json({ error: 'Invalid report entries' }, { status: 400 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username, tier, is_admin')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.is_admin ?? false
  const isPrivileged = isAdmin || profile?.tier === 'tracker'

  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('lat, lng')
    .eq('id', store_id)
    .single()

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  // Geofence — skip for admins, and skip when the client couldn't get GPS
  // (matches documented behavior: submission is still allowed without location)
  if (!isAdmin && typeof lat === 'number' && typeof lng === 'number') {
    const distance = getDistanceMeters(lat, lng, store.lat, store.lng)
    if (distance > MAX_DISTANCE_M) {
      return NextResponse.json({ error: 'You need to be at the store to report stock.' }, { status: 403 })
    }
  }

  // Daily submission limit — free tier only
  if (!isPrivileged) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabaseAdmin
      .from('stock_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('reported_at', todayStart.toISOString())
    if ((count ?? 0) >= DAILY_LIMIT_FREE) {
      return NextResponse.json(
        { error: "You've reached the daily limit of 25 stock reports. Upgrade to Tracker for unlimited." },
        { status: 429 }
      )
    }
  }

  // Dedup — skip drinks this user already reported at this store in the last 30 minutes
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const { data: recent } = await supabaseAdmin
    .from('stock_reports')
    .select('drink_id')
    .eq('user_id', user.id)
    .eq('store_id', store_id)
    .gte('reported_at', since)
  const recentIds = new Set((recent ?? []).map((r) => r.drink_id))
  const toSubmit = reports.filter((r) => !recentIds.has(r.drink_id))

  if (toSubmit.length === 0) {
    return NextResponse.json({ submitted: 0 })
  }

  const { data: drinks } = await supabaseAdmin
    .from('drinks')
    .select('id, name')
    .in('id', toSubmit.map((r) => r.drink_id))
  const drinkNameById = Object.fromEntries((drinks ?? []).map((d) => [d.id, d.name]))

  const { error: insertError } = await supabaseAdmin.from('stock_reports').insert(
    toSubmit.map((r) => ({
      store_id,
      drink_id: r.drink_id,
      quantity: r.quantity,
      user_id: user.id,
    }))
  )
  if (insertError) {
    return NextResponse.json({ error: 'Failed to submit reports' }, { status: 500 })
  }

  if (profile?.username) {
    const firstDrinkName = drinkNameById[toSubmit[0].drink_id] ?? 'a drink'
    const drinkLabel = toSubmit.length > 1 ? `${firstDrinkName} +${toSubmit.length - 1} more` : firstDrinkName
    try {
      await supabaseAdmin.rpc('notify_stock_update', {
        p_store_id: store_id,
        p_drink_name: drinkLabel,
        p_quantity: toSubmit[0].quantity,
        p_reporter_username: profile.username,
      })
    } catch {
      // Notification failure shouldn't fail the report submission
    }
  }

  return NextResponse.json({ submitted: toSubmit.length })
}
