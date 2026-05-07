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

// Edmonds, WA: 47.8107, -122.3776
// Check within ~10 mile bounding box
const { data, error } = await supabase
  .from('stores')
  .select('id, name, address, lat, lng, status')
  .gte('lat', 47.65).lte('lat', 47.95)
  .gte('lng', -122.55).lte('lng', -122.20)

if (error) { console.error(error.message); process.exit(1) }

console.log(`Stores near Edmonds/Seattle: ${data.length}`)
for (const s of data) {
  console.log(`  [${s.status}] ${s.name} — ${s.address}`)
}
