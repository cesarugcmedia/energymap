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

function key(brand, flavor) {
  return `${brand.toLowerCase()}|${flavor.toLowerCase()}`
}

const NEW_DRINKS = [
  // ── Bucked Up ────────────────────────────────────────────────────
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Blood Raz',           caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Blue Raz',            caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Strawberry Kiwi',     caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Gym N Juice',         caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Miami',               caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Killa OJ',            caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Wild Buck',           caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Pink Lemonade',       caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Rocket Pop',          caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Mango Tango',         caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Grape Gainz',         caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Sour Heads',          caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Watermelon',          caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Cherry',              caffeine_mg: 300 },
  { brand: 'Bucked Up', name: 'Bucked Up Energy', flavor: 'Peach Mango Wango',   caffeine_mg: 300 },

  // ── Ryse ─────────────────────────────────────────────────────────
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Smarties',              caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Peach Rings',           caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Baja Burst',            caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Ring Pop Blue Raspberry',caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Ring Pop Strawberry',   caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Neon Blast',            caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Sour Gummy Worm',       caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Strawberry Kiwi',       caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Tropical',              caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Blackberry',            caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Cherry Bomb',           caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Lemon Lime',            caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Sour Orange',           caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Grape',                 caffeine_mg: 200 },
  { brand: 'Ryse', name: 'Ryse Energy', flavor: 'Watermelon',            caffeine_mg: 200 },

  // ── BUM Energy ───────────────────────────────────────────────────
  { brand: 'BUM', name: 'BUM', flavor: 'Jungle Juice',          caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Strawberry Watermelon', caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Peach Rings',           caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Bomb Pop',              caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Cotton Candy',          caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Tropical Punch',        caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Cherry Limeade',        caffeine_mg: 200 },
  { brand: 'BUM', name: 'BUM', flavor: 'Citrus Haze',           caffeine_mg: 200 },

  // ── Bloom ─────────────────────────────────────────────────────────
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Citrus Squeeze',        caffeine_mg: 90 },
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Cherry Limeade',        caffeine_mg: 90 },
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Strawberry Kiwi',       caffeine_mg: 90 },
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Coconut',               caffeine_mg: 90 },
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Mango',                 caffeine_mg: 90 },
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Watermelon',            caffeine_mg: 90 },
  { brand: 'Bloom', name: 'Bloom Energy', flavor: 'Berry',                 caffeine_mg: 90 },

  // ── Jocko Fuel ───────────────────────────────────────────────────
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Citrus Psycho',       caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Sour Apple Sniper',   caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Mango Mayhem',        caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Pink Lemonade',       caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Afterburner Orange',  caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Tropic Thunder',      caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Strawberry Lemonade', caffeine_mg: 95 },
  { brand: 'Jocko Fuel', name: 'Jocko GO', flavor: 'Watermelon Wave',     caffeine_mg: 95 },

  // ── Gorilla Mind ─────────────────────────────────────────────────
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Bombsicle',           caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: "Tiger's Blood",        caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Sour Batch',          caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Shark Gummy',         caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Cotton Candy',        caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Strawberry Kiwi',     caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Blackberry Lemonade', caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Cherry Lime',         caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Blue Razz',           caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Peach Mango',         caffeine_mg: 200 },
  { brand: 'Gorilla Mind', name: 'Gorilla Mind Energy', flavor: 'Tropical',            caffeine_mg: 200 },
]

async function run() {
  const { data: existing, error } = await supabase.from('drinks').select('brand, flavor')
  if (error) { console.error(error.message); process.exit(1) }

  const existingKeys = new Set(existing.map(d => key(d.brand, d.flavor)))
  console.log(`Existing drinks: ${existing.length}`)

  const toInsert = NEW_DRINKS.filter(d => !existingKeys.has(key(d.brand, d.flavor)))
  const skipped = NEW_DRINKS.length - toInsert.length
  console.log(`New to insert: ${toInsert.length} (${skipped} skipped — already exist)`)

  if (toInsert.length === 0) { console.log('Nothing to add.'); process.exit(0) }

  const { error: insertErr } = await supabase.from('drinks').insert(toInsert)
  if (insertErr) { console.error('Insert error:', insertErr.message); process.exit(1) }

  console.log(`Done! ${toInsert.length} drinks added.`)

  // Summary by brand
  const byBrand = {}
  for (const d of toInsert) byBrand[d.brand] = (byBrand[d.brand] ?? 0) + 1
  for (const [brand, count] of Object.entries(byBrand)) {
    console.log(`  ${brand}: ${count} added`)
  }
}

run()
