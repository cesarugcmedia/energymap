import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import type { Store } from '@/lib/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH = 1000
const FREE_RADIUS_MILES = 5
const NEARBY_COUNT_RADIUS_MILES = 10

function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`nearby-stores:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 })
  }

  let isPrivileged = false
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
    if (user) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('tier, is_admin')
        .eq('id', user.id)
        .single()
      isPrivileged = !!(profile?.is_admin || profile?.tier === 'tracker')
    }
  }

  const allStores: Store[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('id, name, type, address, lat, lng')
      .eq('status', 'approved')
      .range(from, from + BATCH - 1)

    if (error) {
      return NextResponse.json({ error: 'Failed to load stores' }, { status: 500 })
    }
    if (!data || data.length === 0) break
    allStores.push(...data)
    if (data.length < BATCH) break
    from += BATCH
  }

  const nearbyCount = allStores.filter(
    (s) => getDistanceMiles(lat, lng, s.lat, s.lng) <= NEARBY_COUNT_RADIUS_MILES
  ).length

  const stores = isPrivileged
    ? allStores
    : allStores.filter((s) => getDistanceMiles(lat, lng, s.lat, s.lng) <= FREE_RADIUS_MILES)

  return NextResponse.json({ stores, nearbyCount })
}
