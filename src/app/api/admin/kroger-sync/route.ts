import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKrogerProductAvailability } from '@/lib/kroger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Give each chunk plenty of headroom under Vercel's serverless duration cap
// (default 10s/15s would get killed mid-loop long before CHUNK_SIZE pairs at
// ~150ms+latency each are done).
export const maxDuration = 60

// Pairs processed per request. The client calls this endpoint repeatedly,
// advancing `offset` each time, until `done: true` — a single request can't
// safely walk every store × drink pair once match counts grow past a few
// dozen, since Vercel would kill the function mid-loop with no partial
// result returned.
const CHUNK_SIZE = 40

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

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

// Admin-triggered for now (not on a schedule yet) — pulls fresh availability
// for every store matched to a Kroger location, for every drink matched to a
// Kroger UPC, one CHUNK_SIZE-pair slice per request. Pass `offset: 0` to
// start; keep POSTing with the returned `nextOffset` until `done: true`.
export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { offset: rawOffset } = await req.json().catch(() => ({}))
  const offset = typeof rawOffset === 'number' && rawOffset >= 0 ? rawOffset : 0

  // Ordered explicitly so pair indexing stays stable across chunked requests
  // — without a deterministic order, Postgres doesn't guarantee the same row
  // order on repeated queries, which would skip or double-sync pairs.
  const { data: stores, error: storesError } = await supabaseAdmin
    .from('stores')
    .select('id, kroger_location_id')
    .not('kroger_location_id', 'is', null)
    .order('id', { ascending: true })

  if (storesError) {
    return NextResponse.json({ error: 'Failed to load matched stores' }, { status: 500 })
  }
  if (!stores || stores.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, totalPairs: 0, nextOffset: 0, done: true, message: 'No stores are matched to a Kroger location yet.' })
  }

  const { data: drinks, error: drinksError } = await supabaseAdmin
    .from('drinks')
    .select('id, kroger_upc')
    .not('kroger_upc', 'is', null)
    .order('id', { ascending: true })

  if (drinksError) {
    return NextResponse.json({ error: 'Failed to load matched drinks' }, { status: 500 })
  }
  if (!drinks || drinks.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, totalPairs: 0, nextOffset: 0, done: true, message: 'No drinks are matched to a Kroger UPC yet.' })
  }

  const totalPairs = stores.length * drinks.length
  const chunkEnd = Math.min(offset + CHUNK_SIZE, totalPairs)

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (let idx = offset; idx < chunkEnd; idx++) {
    const store = stores[Math.floor(idx / drinks.length)]
    const drink = drinks[idx % drinks.length]
    try {
      const availability = await getKrogerProductAvailability(drink.kroger_upc!, store.kroger_location_id!)
      if (availability) {
        const { error } = await supabaseAdmin
          .from('kroger_stock')
          .upsert(
            {
              store_id: store.id,
              drink_id: drink.id,
              in_stock: availability.inStock,
              price: availability.price,
              checked_at: new Date().toISOString(),
            },
            { onConflict: 'store_id,drink_id' }
          )
        if (error) throw error
        synced++
      }
    } catch (err: any) {
      failed++
      errors.push(`store=${store.id} drink=${drink.id}: ${err?.message ?? 'unknown error'}`)
    }
    // Be gentle on Kroger's rate limits between calls.
    await sleep(150)
  }

  return NextResponse.json({
    synced,
    failed,
    storeCount: stores.length,
    drinkCount: drinks.length,
    totalPairs,
    offset,
    nextOffset: chunkEnd,
    done: chunkEnd >= totalPairs,
    errors: errors.slice(0, 10),
  })
}
