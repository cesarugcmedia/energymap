// Reverse-geocodes every approved store's lat/lng to fill in stores.state.
// This script only tags data — it never hides anything. The actual NC/FL
// filtering lives in the app (src/app/api/stores/nearby, /api/stats,
// src/app/community/page.tsx) and fails open: a store with no state tag yet
// still shows everywhere, so running this script never makes the live map
// go blank mid-run. Run scripts/add-store-state-column.sql first.
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

const PROGRESS_FILE = 'scripts/.state-tag-progress.json'
const BATCH = 1000

const progress = existsSync(PROGRESS_FILE)
  ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  : { done: {} } // store id -> resolved state (or null if lookup failed)
const doneMap = new Map(Object.entries(progress.done))

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function reverseGeocodeState(lat, lng, retries = 3) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=8`
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AmpedMap/1.0 (state tagging script)', Accept: 'application/json' },
      })
      if (!res.ok) return null
      const json = await res.json()
      return json.address?.state ?? null
    } catch {
      if (attempt < retries - 1) await sleep(3000)
    }
  }
  return null
}

console.log('Loading approved stores...')
const allStores = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, lat, lng, state')
    .eq('status', 'approved')
    .range(from, from + BATCH - 1)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data || data.length === 0) break
  allStores.push(...data)
  if (data.length < BATCH) break
  from += BATCH
}

// Skip stores that already have a state tagged (from a previous run) or
// were already resolved and saved to the local progress file.
const targets = allStores.filter((s) => !s.state && !doneMap.has(s.id))
console.log(`Total approved stores: ${allStores.length}`)
console.log(`Already tagged (in DB or a previous run): ${allStores.length - targets.length}`)
console.log(`Left to tag: ${targets.length}`)
console.log(`Estimated time: ~${Math.ceil((targets.length * 1.1) / 60)} minutes\n`)

for (let i = 0; i < targets.length; i++) {
  const store = targets[i]
  process.stdout.write(`\r[${i + 1}/${targets.length}] tagging "${store.name}"...          `)

  const state = await reverseGeocodeState(store.lat, store.lng)
  doneMap.set(store.id, state)

  if (state) {
    const { error } = await supabase.from('stores').update({ state }).eq('id', store.id)
    if (error) console.error(`\nFailed to update ${store.id}: ${error.message}`)
  }

  if ((i + 1) % 50 === 0) {
    writeFileSync(PROGRESS_FILE, JSON.stringify({ done: Object.fromEntries(doneMap) }))
  }
  await sleep(1100) // Nominatim rate limit: 1 req/sec
}
writeFileSync(PROGRESS_FILE, JSON.stringify({ done: Object.fromEntries(doneMap) }))

const tagged = [...doneMap.values()].filter(Boolean).length
const failed = [...doneMap.values()].filter((v) => !v).length
console.log(`\n\nDone. Tagged this run: ${tagged} | Unresolved: ${failed}`)
if (failed > 0) {
  console.log(`${failed} stores couldn't be reverse-geocoded and will keep showing everywhere (fail-open) until you re-run this script or set their state manually.`)
}
