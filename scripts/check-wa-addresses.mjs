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

// Washington state bounding box
const { data, error } = await supabase
  .from('stores')
  .select('id, name, address, lat, lng')
  .gte('lat', 45.5).lte('lat', 49.1)
  .gte('lng', -124.9).lte('lng', -116.9)
  .range(0, 9999)

if (error) { console.error(error.message); process.exit(1) }

const coordStores = data.filter(s => COORD_PATTERN.test(s.address?.trim() ?? ''))
const goodStores = data.filter(s => !COORD_PATTERN.test(s.address?.trim() ?? ''))

console.log(`Total WA stores: ${data.length}`)
console.log(`With real addresses: ${goodStores.length}`)
console.log(`Still coordinates: ${coordStores.length}`)

if (coordStores.length > 0) {
  console.log('\nStores still needing addresses:')
  for (const s of coordStores) {
    console.log(`  [${s.id}] ${s.name} — ${s.address}`)
  }
}
