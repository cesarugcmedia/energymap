import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKrogerProductAvailability } from '@/lib/kroger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
// Kroger UPC. Run this manually (e.g. via curl with an admin session token)
// until the pairing has been verified against real data.
export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: stores, error: storesError } = await supabaseAdmin
    .from('stores')
    .select('id, kroger_location_id')
    .not('kroger_location_id', 'is', null)

  if (storesError) {
    return NextResponse.json({ error: 'Failed to load matched stores' }, { status: 500 })
  }
  if (!stores || stores.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, message: 'No stores are matched to a Kroger location yet.' })
  }

  const { data: drinks, error: drinksError } = await supabaseAdmin
    .from('drinks')
    .select('id, kroger_upc')
    .not('kroger_upc', 'is', null)

  if (drinksError) {
    return NextResponse.json({ error: 'Failed to load matched drinks' }, { status: 500 })
  }
  if (!drinks || drinks.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, message: 'No drinks are matched to a Kroger UPC yet.' })
  }

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const store of stores) {
    for (const drink of drinks) {
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
  }

  return NextResponse.json({
    synced,
    failed,
    storeCount: stores.length,
    drinkCount: drinks.length,
    errors: errors.slice(0, 10),
  })
}
