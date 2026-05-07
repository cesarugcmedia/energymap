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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const COORD_PATTERN = /^-?\d+\.\d+,\s*-?\d+\.\d+$/
const BATCH = 1000

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
      const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county
      if (city)           parts.push(city)
      if (a.state)        parts.push(a.state)
      if (a.postcode)     parts.push(a.postcode)
      return parts.length >= 2 ? parts.join(', ') : null
    } catch {
      if (attempt < retries - 1) await sleep(3000)
    }
  }
  return null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Paginate through all stores
console.log('Loading all stores...')
const allStores = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('stores')
    .select('id, lat, lng, address')
    .range(from, from + BATCH - 1)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data || data.length === 0) break
  allStores.push(...data)
  if (data.length < BATCH) break
  from += BATCH
}

const targets = allStores.filter(s => COORD_PATTERN.test(s.address?.trim() ?? ''))
console.log(`Total stores loaded: ${allStores.length}`)
console.log(`Stores with coordinate addresses: ${targets.length}`)
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

  await sleep(1100)
}

console.log(`\n\nDone! Updated: ${updated} | Still missing: ${failed}`)
