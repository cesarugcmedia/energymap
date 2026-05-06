import { readFileSync, writeFileSync, existsSync } from 'fs'
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

const PROGRESS_FILE = 'scripts/.geocode-progress.json'
const COORD_PATTERN = /^-?\d+\.\d+,\s*-?\d+\.\d+$/

// Load progress from previous run
const progress = existsSync(PROGRESS_FILE)
  ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  : { done: [] }
const doneSet = new Set(progress.done)

async function reverseGeocode(lat, lon, retries = 3) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AmpedMap/1.0 (address fix script)', 'Accept': 'application/json' },
      })
      if (!res.ok) return null
      const json = await res.json()
      const a = json.address ?? {}
      const parts = []
      if (a.house_number) parts.push(a.house_number)
      if (a.road)         parts.push(a.road)
      const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb
      if (city)           parts.push(city)
      if (a.state)        parts.push(a.state)
      if (a.postcode)     parts.push(a.postcode)
      return parts.length >= 3 ? parts.join(', ') : null
    } catch {
      if (attempt < retries - 1) await sleep(3000)
    }
  }
  return null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Fetch all stores with coordinate-only addresses
console.log('Loading stores with missing addresses...')
const { data: stores, error } = await supabase
  .from('stores')
  .select('id, lat, lng, address')

if (error) { console.error(error.message); process.exit(1) }

const targets = stores.filter(s =>
  COORD_PATTERN.test(s.address?.trim() ?? '') && !doneSet.has(s.id)
)

console.log(`Stores to geocode: ${targets.length} (${doneSet.size} already done from previous run)`)
console.log(`Estimated time: ~${Math.ceil(targets.length * 1.1 / 60)} minutes\n`)

let updated = 0
let failed = 0

for (let i = 0; i < targets.length; i++) {
  const store = targets[i]
  process.stdout.write(`\r[${i + 1}/${targets.length}] updated: ${updated} failed: ${failed}`)

  const address = await reverseGeocode(store.lat, store.lng)

  if (address) {
    const { error: updateErr } = await supabase
      .from('stores')
      .update({ address })
      .eq('id', store.id)
    if (!updateErr) updated++
    else failed++
  } else {
    failed++
  }

  doneSet.add(store.id)

  // Save progress every 50 stores
  if ((i + 1) % 50 === 0) {
    writeFileSync(PROGRESS_FILE, JSON.stringify({ done: [...doneSet] }))
  }

  await sleep(1100) // Nominatim rate limit: 1 req/sec
}

// Final save
writeFileSync(PROGRESS_FILE, JSON.stringify({ done: [...doneSet] }))

console.log(`\n\nDone! Updated: ${updated} | Failed/skipped: ${failed}`)
