import { createClient } from '@supabase/supabase-js'
import { getKrogerProductAvailability } from '@/lib/kroger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Pairs processed per chunk. Callers loop, advancing `offset` by the
// returned `nextOffset` until `done: true` — walking every store × drink
// pair in one shot isn't safe once match counts grow past a few dozen,
// since a serverless function would get killed mid-loop with no partial
// result returned.
export const KROGER_SYNC_CHUNK_SIZE = 40

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export interface KrogerSyncChunkResult {
  synced: number
  failed: number
  storeCount: number
  drinkCount: number
  totalPairs: number
  offset: number
  nextOffset: number
  done: boolean
  errors: string[]
  message?: string
}

// Pulls fresh availability for one chunk of matched-store × matched-drink
// pairs, starting at `offset`. Shared by the admin-triggered sync route and
// the scheduled cron route so both walk the exact same pairing logic.
export async function runKrogerSyncChunk(offset: number): Promise<KrogerSyncChunkResult> {
  // Ordered explicitly so pair indexing stays stable across chunked calls —
  // without a deterministic order, Postgres doesn't guarantee the same row
  // order on repeated queries, which would skip or double-sync pairs.
  const { data: stores, error: storesError } = await supabaseAdmin
    .from('stores')
    .select('id, kroger_location_id')
    .not('kroger_location_id', 'is', null)
    .order('id', { ascending: true })

  if (storesError) {
    throw new Error('Failed to load matched stores')
  }
  if (!stores || stores.length === 0) {
    return { synced: 0, failed: 0, storeCount: 0, drinkCount: 0, totalPairs: 0, offset, nextOffset: 0, done: true, errors: [], message: 'No stores are matched to a Kroger location yet.' }
  }

  const { data: drinks, error: drinksError } = await supabaseAdmin
    .from('drinks')
    .select('id, kroger_upc')
    .not('kroger_upc', 'is', null)
    .order('id', { ascending: true })

  if (drinksError) {
    throw new Error('Failed to load matched drinks')
  }
  if (!drinks || drinks.length === 0) {
    return { synced: 0, failed: 0, storeCount: stores.length, drinkCount: 0, totalPairs: 0, offset, nextOffset: 0, done: true, errors: [], message: 'No drinks are matched to a Kroger UPC yet.' }
  }

  const totalPairs = stores.length * drinks.length
  const chunkEnd = Math.min(offset + KROGER_SYNC_CHUNK_SIZE, totalPairs)

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
              stock_level: availability.stockLevel,
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

  return {
    synced,
    failed,
    storeCount: stores.length,
    drinkCount: drinks.length,
    totalPairs,
    offset,
    nextOffset: chunkEnd,
    done: chunkEnd >= totalPairs,
    errors: errors.slice(0, 10),
  }
}
