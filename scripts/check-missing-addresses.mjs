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

const { data, error } = await supabase.from('stores').select('id, address')
if (error) { console.error(error.message); process.exit(1) }

// Coordinate fallback pattern: "25.76123, -80.19234"
const coordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/
const missing = data.filter(s => coordPattern.test(s.address?.trim() ?? ''))

console.log(`Total stores: ${data.length}`)
console.log(`Missing real address (coord fallback): ${missing.length}`)
