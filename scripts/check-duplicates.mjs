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
  .select('id, name, address, lat, lng, status')

if (error) { console.error(error.message); process.exit(1) }
console.log(`Total stores: ${stores.length}`)

// 1. Exact coordinate duplicates
const coordMap = new Map()
for (const s of stores) {
  const key = `${s.lat},${s.lng}`
  if (!coordMap.has(key)) coordMap.set(key, [])
  coordMap.get(key).push(s)
}
const exactDupes = [...coordMap.values()].filter(g => g.length > 1)

// 2. Near-duplicate coordinates (~110m grid)
const nearMap = new Map()
for (const s of stores) {
  const key = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`
  if (!nearMap.has(key)) nearMap.set(key, [])
  nearMap.get(key).push(s)
}
const nearDupes = [...nearMap.values()].filter(g => g.length > 1)

// Report
console.log(`\n--- Exact coordinate duplicates: ${exactDupes.length} groups ---`)
for (const group of exactDupes.slice(0, 20)) {
  console.log(`  [${group[0].lat}, ${group[0].lng}]`)
  for (const s of group) console.log(`    ${s.id} | ${s.name} | ${s.address}`)
}
if (exactDupes.length > 20) console.log(`  ... and ${exactDupes.length - 20} more groups`)

console.log(`\n--- Near-duplicate coordinates (~110m): ${nearDupes.length} groups ---`)
let nearOnlyCount = 0
for (const group of nearDupes) {
  const key = `${group[0].lat.toFixed(3)},${group[0].lng.toFixed(3)}`
  const isAlsoExact = exactDupes.some(g => `${g[0].lat.toFixed(3)},${g[0].lng.toFixed(3)}` === key)
  if (!isAlsoExact) {
    nearOnlyCount++
    if (nearOnlyCount <= 20) {
      console.log(`  ~[${key}]`)
      for (const s of group) console.log(`    ${s.id} | ${s.name} | ${s.lat.toFixed(5)},${s.lng.toFixed(5)} | ${s.address}`)
    }
  }
}
if (nearOnlyCount > 20) console.log(`  ... and ${nearOnlyCount - 20} more groups`)
console.log(`  (${nearDupes.length - nearOnlyCount} of those already counted as exact dupes)`)

const totalDupeIds = new Set()
for (const group of exactDupes) group.slice(1).forEach(s => totalDupeIds.add(s.id))

console.log(`\nSummary:`)
console.log(`  Exact duplicate groups: ${exactDupes.length}`)
console.log(`  Near-duplicate groups (not exact): ${nearOnlyCount}`)
console.log(`  Rows that can be safely deleted (keeping 1 per exact group): ${totalDupeIds.size}`)
