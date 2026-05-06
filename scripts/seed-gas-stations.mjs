import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
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

// To re-seed a state, add it back to this array.
// FL, CA, TX, NY were seeded 2026-05-06 (200 each).
// IL was seeded 2026-05-06 (199).
const AREAS = [
  { name: 'New Jersey', query: `area["name"="New Jersey"]["admin_level"="4"]`, limit: 200 },
]

// New Jersey bounding box for dedup check
const IL_BOUNDS = { minLat: 38.92, maxLat: 41.36, minLng: -75.56, maxLng: -73.89 }

async function loadExistingCoords(bounds) {
  const { data, error } = await supabase
    .from('stores')
    .select('lat, lng')
    .gte('lat', bounds.minLat).lte('lat', bounds.maxLat)
    .gte('lng', bounds.minLng).lte('lng', bounds.maxLng)
  if (error) throw error
  // Round to 3 decimal places (~110m grid) for proximity dedup
  return new Set((data ?? []).map(s => `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`))
}

async function fetchStations(area) {
  const overpassQuery = `[out:json][timeout:90];${area.query}->.searchArea;node["amenity"="fuel"](area.searchArea);out ${area.limit};`
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AmpedMap/1.0 (seed script)',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = await res.json()
  return json.elements ?? []
}

function buildAddress(tags, fallbackArea) {
  const parts = []
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber'])
  if (tags['addr:street'])      parts.push(tags['addr:street'])
  if (tags['addr:city'])        parts.push(tags['addr:city'])
  if (tags['addr:state'])       parts.push(tags['addr:state'])
  if (tags['addr:postcode'])    parts.push(tags['addr:postcode'])
  return parts.length >= 2 ? parts.join(', ') : fallbackArea
}

function toStore(node, fallbackArea) {
  const tags = node.tags ?? {}
  const name = tags.name ?? tags.brand ?? tags.operator ?? 'Gas Station'
  return {
    name,
    type: 'gas_station',
    address: buildAddress(tags, fallbackArea),
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

    // Load existing stores in the bounding box to avoid duplicates
    console.log('  Loading existing stores for dedup...')
    const existing = await loadExistingCoords(IL_BOUNDS)
    console.log(`  ${existing.size} existing stores in bounding box`)

    const stores = nodes
      .map(n => toStore(n, area.name))
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
