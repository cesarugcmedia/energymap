import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { searchKrogerLocations } from '@/lib/kroger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin ? user : null
}

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const MATCH_RADIUS_METERS = 150

// Pulls Kroger's own locations near a zip code and, for each one:
//  - if it's already linked to a store, skips it
//  - if an existing (crowdsourced) store sits within ~150m, links that store
//    instead of creating a duplicate pin
//  - otherwise creates a brand-new approved store row for it
// New stores are left with state = NULL — tag-store-states.mjs picks them up
// on its next run same as any other store, so NC/FL filtering stays uniform.
export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { zipCode, radiusMiles, limit } = await req.json().catch(() => ({}))
  if (!zipCode) {
    return NextResponse.json({ error: 'Missing zipCode' }, { status: 400 })
  }

  let candidates
  try {
    candidates = await searchKrogerLocations(zipCode, radiusMiles || 10, limit || 25)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Kroger location search failed' }, { status: 502 })
  }

  const { data: existingStores, error: fetchError } = await supabaseAdmin
    .from('stores')
    .select('id, lat, lng, kroger_location_id')
    .eq('status', 'approved')

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to load existing stores' }, { status: 500 })
  }

  const known = existingStores ?? []
  let created = 0
  let matched = 0
  let alreadyLinked = 0
  let failed = 0

  for (const loc of candidates) {
    if (known.some((s) => s.kroger_location_id === loc.locationId)) {
      alreadyLinked++
      continue
    }

    const nearby = known.find((s) =>
      !s.kroger_location_id &&
      typeof s.lat === 'number' && typeof s.lng === 'number' &&
      getDistanceMeters(s.lat, s.lng, loc.lat, loc.lng) <= MATCH_RADIUS_METERS
    )

    if (nearby) {
      const { error } = await supabaseAdmin
        .from('stores')
        .update({ kroger_location_id: loc.locationId })
        .eq('id', nearby.id)
      if (error) { failed++ } else { matched++; nearby.kroger_location_id = loc.locationId }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('stores')
        .insert({
          name: loc.name,
          address: loc.address,
          lat: loc.lat,
          lng: loc.lng,
          type: 'grocery',
          status: 'approved',
          kroger_location_id: loc.locationId,
        })
        .select('id, lat, lng, kroger_location_id')
        .single()
      if (error || !inserted) { failed++ } else { created++; known.push(inserted) }
    }
  }

  return NextResponse.json({ candidatesFound: candidates.length, created, matched, alreadyLinked, failed })
}
