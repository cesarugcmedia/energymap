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

const { data, error } = await supabase.from('drinks').select('*').order('brand').order('name')
if (error) { console.error(error.message); process.exit(1) }

console.log(`Total drinks: ${data.length}\n`)
for (const d of data) {
  console.log(`[${d.brand}] ${d.name} — ${d.flavor} (${d.caffeine_mg ?? '?'}mg)`)
}
