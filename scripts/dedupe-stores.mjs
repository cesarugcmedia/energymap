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

console.log('Loading all stores...')
const { data: stores, error } = await supabase
  .from('stores')
  .select('id, name, address, lat, lng')
  .order('created_at', { ascending: true }) // keep the oldest row in each group

if (error) { console.error(error.message); process.exit(1) }
console.log(`Total stores: ${stores.length}`)

const toDelete = new Set()

// Normalize address for comparison
function normalizeAddr(addr) {
  return (addr ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Duplicate addresses — only match on real street addresses (must contain a digit)
const addrMap = new Map()
for (const s of stores) {
  const key = normalizeAddr(s.address)
  if (!key || !/\d/.test(key)) continue // skip coordinate or generic fallbacks
  if (!addrMap.has(key)) { addrMap.set(key, s.id); continue }
  toDelete.add(s.id)
}

// Duplicate coordinates
const coordMap = new Map()
for (const s of stores) {
  const key = `${s.lat},${s.lng}`
  if (!coordMap.has(key)) { coordMap.set(key, s.id); continue }
  toDelete.add(s.id)
}

console.log(`\nFound ${toDelete.size} rows to delete`)
if (toDelete.size === 0) { console.log('Nothing to do.'); process.exit(0) }

// Delete in batches of 100
const ids = [...toDelete]
let deleted = 0
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100)
  const { error: delErr } = await supabase.from('stores').delete().in('id', batch)
  if (delErr) { console.error(`Batch error: ${delErr.message}`); continue }
  deleted += batch.length
  process.stdout.write(`\rDeleted ${deleted}/${ids.length}`)
}

console.log(`\nDone. ${deleted} duplicate rows removed. ${stores.length - deleted} stores remain.`)
