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

// Dedup key: brand|flavor (lowercase)
function key(brand, flavor) {
  return `${brand.toLowerCase()}|${flavor.toLowerCase()}`
}

const NEW_DRINKS = [
  // ── Monster Energy ──────────────────────────────────────────────
  { brand: 'Monster', name: 'Monster Energy',       flavor: 'Lo-Carb',            caffeine_mg: 140 },
  { brand: 'Monster', name: 'Monster Energy',       flavor: 'Assault',            caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Sunrise',      caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Violet',       caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Rosa',         caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Gold',         caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Blue',         caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Watermelon',   caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Fiesta',       caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Ultra',        flavor: 'Ultra Paradise',     caffeine_mg: 150 },
  { brand: 'Monster', name: 'Monster Juice',        flavor: 'Pacific Punch',      caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Juice',        flavor: 'Mango Loco',         caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Juice',        flavor: 'Pipeline Punch',     caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Juice',        flavor: 'Khaos',              caffeine_mg: 70  },
  { brand: 'Monster', name: 'Monster Rehab',        flavor: 'Lemonade Tea',       caffeine_mg: 161 },
  { brand: 'Monster', name: 'Monster Rehab',        flavor: 'Raspberry Tea',      caffeine_mg: 161 },
  { brand: 'Monster', name: 'Monster Rehab',        flavor: 'Orange Tea',         caffeine_mg: 161 },
  { brand: 'Monster', name: 'Monster Java',         flavor: 'Mean Bean',          caffeine_mg: 188 },
  { brand: 'Monster', name: 'Monster Java',         flavor: 'Loca Moca',          caffeine_mg: 188 },
  { brand: 'Monster', name: 'Monster Java',         flavor: 'Salted Caramel',     caffeine_mg: 188 },
  { brand: 'Monster', name: 'Monster Java',         flavor: 'Vanilla Light',      caffeine_mg: 188 },
  { brand: 'Monster', name: 'Monster Java',         flavor: 'Swiss Chocolate',    caffeine_mg: 188 },
  { brand: 'Monster', name: 'Monster Reserve',      flavor: 'Orange Dreamsicle',  caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Reserve',      flavor: 'Watermelon',         caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Reserve',      flavor: 'White Pineapple',    caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Hydro',        flavor: 'Mean Green',         caffeine_mg: 125 },
  { brand: 'Monster', name: 'Monster Hydro',        flavor: 'Purple Thunder',     caffeine_mg: 125 },
  { brand: 'Monster', name: 'Monster Hydro',        flavor: 'Blue Ice',           caffeine_mg: 125 },
  { brand: 'Monster', name: 'Monster Hydro',        flavor: 'Mango',              caffeine_mg: 125 },
  { brand: 'Monster', name: 'Monster Import',       flavor: 'Original',           caffeine_mg: 179 },
  { brand: 'Monster', name: 'Monster Dragon Tea',   flavor: 'Green Tea',          caffeine_mg: 160 },
  { brand: 'Monster', name: 'Monster Dragon Tea',   flavor: 'White Tea',          caffeine_mg: 160 },

  // ── Bang Energy ─────────────────────────────────────────────────
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Black Cherry Vanilla',    caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Blue Razz',               caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Candy Apple Crisp',       caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Cotton Candy',            caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Lemon Drop',              caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Miami Cola',              caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Peach Mango',             caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Power Punch',             caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Purple Guava Pear',       caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Rainbow Unicorn',         caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Root Beer',               caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Sour Heads',              caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Star Blast',              caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Watermelon',              caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Frose Rose',              caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Nectarine Blueberry',     caffeine_mg: 300 },
  { brand: 'Bang', name: 'Bang Energy', flavor: 'Delish Strawberry Kiss',  caffeine_mg: 300 },

  // ── Rockstar ─────────────────────────────────────────────────────
  { brand: 'Rockstar', name: 'Rockstar Energy',      flavor: 'Original',                    caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Energy',      flavor: 'Zero Carb',                   caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Pure Zero',   flavor: 'Punched',                     caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Pure Zero',   flavor: 'Silver Ice',                  caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Pure Zero',   flavor: 'Watermelon',                  caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Juiced',      flavor: 'El Mango',                    caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Juiced',      flavor: 'Mango Orange Passionfruit',   caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Revolt',      flavor: 'Killer Citrus',               caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Revolt',      flavor: 'Killer Grape',                caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Revolt',      flavor: 'Black Cherry',                caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Boom',        flavor: 'Whipped Strawberry',          caffeine_mg: 160 },
  { brand: 'Rockstar', name: 'Rockstar Hardcore',    flavor: 'Apple',                       caffeine_mg: 240 },

  // ── NOS ──────────────────────────────────────────────────────────
  { brand: 'NOS', name: 'NOS Energy', flavor: 'Original',    caffeine_mg: 160 },
  { brand: 'NOS', name: 'NOS Energy', flavor: 'Sonic Sour',  caffeine_mg: 160 },
  { brand: 'NOS', name: 'NOS Energy', flavor: 'GT Grape',    caffeine_mg: 160 },
  { brand: 'NOS', name: 'NOS Energy', flavor: 'Sugar Free',  caffeine_mg: 160 },
  { brand: 'NOS', name: 'NOS Energy', flavor: 'Power Punch', caffeine_mg: 160 },
  { brand: 'NOS', name: 'NOS Energy', flavor: 'Turbo',       caffeine_mg: 260 },

  // ── Full Throttle ────────────────────────────────────────────────
  { brand: 'Full Throttle', name: 'Full Throttle', flavor: 'Original',   caffeine_mg: 160 },
  { brand: 'Full Throttle', name: 'Full Throttle', flavor: 'Blue Agave', caffeine_mg: 160 },

  // ── Reign ─────────────────────────────────────────────────────────
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Carnival Candy',     caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Cherry Limeade',     caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Lemon HDZ',          caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Lilikoi Lychee',     caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Melon Mania',        caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Orange Dreamsicle',  caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Peach Fizz',         caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Razzle Dazzle',      caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Sour Apple',         caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Strawberry Sublime', caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Tropical Storm',     caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'Watermelon Warlord', caffeine_mg: 300 },
  { brand: 'Reign', name: 'Reign Total Body Fuel', flavor: 'White Gummy Bear',   caffeine_mg: 300 },

  // ── C4 Energy ────────────────────────────────────────────────────
  { brand: 'C4', name: 'C4 Energy', flavor: 'Arctic Snow Cone',      caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Berry Blast',           caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Frozen Bombsicle',      caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Freedom Ice',           caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Midnight Cherry',       caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Orange Slice',          caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Purple Frost',          caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Skittles Strawberry',   caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Starburst Strawberry',  caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Starburst Watermelon',  caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Tropical Blast',        caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Twisted Limeade',       caffeine_mg: 200 },
  { brand: 'C4', name: 'C4 Energy', flavor: 'Sour Batch Bros',       caffeine_mg: 200 },

  // ── ZOA Energy ───────────────────────────────────────────────────
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'Lemon Lime',         caffeine_mg: 160 },
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'Mango Grapefruit',   caffeine_mg: 160 },
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'Original',           caffeine_mg: 160 },
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'Super Berry',        caffeine_mg: 160 },
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'Wild Orange',        caffeine_mg: 160 },
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'White Peach',        caffeine_mg: 160 },
  { brand: 'ZOA', name: 'ZOA Energy', flavor: 'Pineapple Coconut',  caffeine_mg: 160 },

  // ── Prime Energy ─────────────────────────────────────────────────
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Blue Raspberry',        caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Cherry Freeze',         caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Grape',                 caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Ice Pop',               caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Lemon Lime',            caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Meta Moon',             caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Orange Mango',          caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Strawberry Watermelon', caffeine_mg: 200 },
  { brand: 'Prime', name: 'Prime Energy', flavor: 'Tropical Punch',        caffeine_mg: 200 },

  // ── 5-hour Energy ────────────────────────────────────────────────
  { brand: '5-hour Energy', name: '5-hour Energy',        flavor: 'Berry',              caffeine_mg: 200 },
  { brand: '5-hour Energy', name: '5-hour Energy',        flavor: 'Grape',              caffeine_mg: 200 },
  { brand: '5-hour Energy', name: '5-hour Energy',        flavor: 'Orange',             caffeine_mg: 200 },
  { brand: '5-hour Energy', name: '5-hour Energy',        flavor: 'Pink Lemonade',      caffeine_mg: 200 },
  { brand: '5-hour Energy', name: '5-hour Energy Extra',  flavor: 'Berry',              caffeine_mg: 230 },
  { brand: '5-hour Energy', name: '5-hour Energy Extra',  flavor: 'Grape',              caffeine_mg: 230 },
  { brand: '5-hour Energy', name: '5-hour Energy Extra',  flavor: 'Strawberry Banana',  caffeine_mg: 230 },

  // ── Xyience ──────────────────────────────────────────────────────
  { brand: 'Xyience', name: 'Xyience', flavor: 'Cherry Lime',    caffeine_mg: 176 },
  { brand: 'Xyience', name: 'Xyience', flavor: 'Cran Razz',      caffeine_mg: 176 },
  { brand: 'Xyience', name: 'Xyience', flavor: 'Fuji Apple',     caffeine_mg: 176 },
  { brand: 'Xyience', name: 'Xyience', flavor: 'Mango Guava',    caffeine_mg: 176 },
  { brand: 'Xyience', name: 'Xyience', flavor: 'Pink Grapefruit',caffeine_mg: 176 },
  { brand: 'Xyience', name: 'Xyience', flavor: 'Tangerine',      caffeine_mg: 176 },

  // ── Red Bull (fill gaps) ─────────────────────────────────────────
  { brand: 'Red Bull', name: 'Red Bull', flavor: 'Blue Edition (Blueberry)',     caffeine_mg: 80 },
  { brand: 'Red Bull', name: 'Red Bull', flavor: 'Orange Edition (Mandarin)',    caffeine_mg: 80 },
  { brand: 'Red Bull', name: 'Red Bull', flavor: 'Purple Edition (Acai Berry)',  caffeine_mg: 80 },
  { brand: 'Red Bull', name: 'Red Bull', flavor: 'Pink Edition (Wild Berry)',    caffeine_mg: 80 },
  { brand: 'Red Bull', name: 'Red Bull', flavor: 'Tropical Edition',            caffeine_mg: 80 },
]

async function run() {
  // Fetch existing drinks
  const { data: existing, error } = await supabase.from('drinks').select('brand, flavor')
  if (error) { console.error(error.message); process.exit(1) }

  const existingKeys = new Set(existing.map(d => key(d.brand, d.flavor)))
  console.log(`Existing drinks: ${existing.length}`)

  const toInsert = NEW_DRINKS.filter(d => !existingKeys.has(key(d.brand, d.flavor)))
  const skipped = NEW_DRINKS.length - toInsert.length
  console.log(`New to insert: ${toInsert.length} (${skipped} already exist)`)

  if (toInsert.length === 0) { console.log('Nothing to add.'); process.exit(0) }

  const { error: insertErr } = await supabase.from('drinks').insert(toInsert)
  if (insertErr) { console.error('Insert error:', insertErr.message); process.exit(1) }

  console.log(`Done! ${toInsert.length} drinks added.`)
}

run()
