import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

try {
  const env = readFileSync('.env.local', 'utf8')
  for (const line of env.split('\n')) {
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1 || line.trim().startsWith('#')) continue
    const key = line.slice(0, eqIdx).trim()
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) process.env[key] = val
  }
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Previously seeded: FL, CA, TX, NY, IL, NJ (2026-05-06)
const AREAS = [
  { name: 'Washington (Seattle/Edmonds)', query: `area["name"="Washington"]["admin_level"="4"]`, limit: 200, bounds: { minLat: 45.54, maxLat: 49.00, minLng: -124.80, maxLng: -116.92 } },
]

async function loadExistingCoords(bounds) {
  const { data, error } = await supabase
    .from('stores')
    .select('lat, lng')
    .gte('lat', bounds.minLat).lte('lat', bounds.maxLat)
    .gte('lng', bounds.minLng).lte('lng', bounds.maxLng)
  if (error) throw error
  return new Set((data ?? []).map(s => `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`))
}

async function fetchStations(area) {
  const overpassQuery = `[out:json][timeout:90];${area.query}->.searchArea;node["amenity"="fuel"](area.searchArea);out ${area.limit};`
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AmpedMap/1.0 (seed script)', 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = await res.json()
  return json.elements ?? []
}

function buildAddress(tags, lat, lon) {
  const parts = []
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber'])
  if (tags['addr:street'])      parts.push(tags['addr:street'])
  if (tags['addr:city'])        parts.push(tags['addr:city'])
  if (tags['addr:state'])       parts.push(tags['addr:state'])
  if (tags['addr:postcode'])    parts.push(tags['addr:postcode'])
  // Fall back to coordinates so every store has a unique address
  return parts.length >= 2 ? parts.join(', ') : `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

function toStore(node) {
  const tags = node.tags ?? {}
  return {
    name: tags.name ?? tags.brand ?? tags.operator ?? 'Gas Station',
    type: 'gas_station',
    address: buildAddress(tags, node.lat, node.lon),
    lat: node.lat,
    lng: node.lon,
    status: 'approved',
    submitted_by: null,
  }
}

async function insertBatch(stores) {
  const { error } = await supabase.from('stores').insert(stores)
  if (error) throw error
}

async function seed() {
  let grandTotal = 0

  for (const area of AREAS) {
    console.log(`\nFetching ${area.name}...`)

    let nodes
    try {
      nodes = await fetchStations(area)
    } catch (err) {
      console.error(`  Failed to fetch: ${err.message}`)
      continue
    }
    console.log(`  ${nodes.length} stations found from Overpass`)

    const existing = await loadExistingCoords(area.bounds)
    console.log(`  ${existing.size} existing stores in bounding box`)

    const stores = nodes
      .map(toStore)
      .filter(s => !existing.has(`${s.lat.toFixed(3)},${s.lng.toFixed(3)}`))

    console.log(`  ${stores.length} new (${nodes.length - stores.length} skipped as duplicates)`)

    const BATCH = 50
    let inserted = 0
    for (let i = 0; i < stores.length; i += BATCH) {
      const batch = stores.slice(i, i + BATCH)
      try {
        await insertBatch(batch)
        inserted += batch.length
        process.stdout.write(`\r  Inserted ${inserted}/${stores.length}`)
      } catch (err) {
        console.error(`\n  Batch error: ${err.message}`)
      }
    }
    console.log(`\n  Done — ${inserted} inserted`)
    grandTotal += inserted

    if (area !== AREAS.at(-1)) {
      console.log('  Waiting 3s before next area...')
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  console.log(`\nTotal inserted: ${grandTotal}`)
}

seed()
