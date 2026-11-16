// Best-effort place parsing from the free-text `stores.address` field (there
// is no structured city/state column). Handles both Census-style
// ("1200 N Main St, Tulsa, OK 74103") and Nominatim-style
// ("..., Tulsa, Tulsa County, Oklahoma, 74103, United States") addresses.

export const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
}
export const KNOWN_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR))

/** "Tulsa, OK", or null when the address doesn't parse cleanly. */
export function cityState(address: string | null | undefined): string | null {
  if (!address) return null
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  // Census style: "..., City, ST 12345"
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/)
    if (m && KNOWN_ABBRS.has(m[1]) && !/\d/.test(parts[i - 1])) return `${parts[i - 1]}, ${m[1]}`
  }
  // Nominatim style: "..., City, Some County, State, 12345, United States"
  const stateIdx = parts.findIndex((p) => STATE_NAME_TO_ABBR[p.toLowerCase()])
  if (stateIdx > 0) {
    const abbr = STATE_NAME_TO_ABBR[parts[stateIdx].toLowerCase()]
    let j = stateIdx - 1
    if (/ county$| parish$/i.test(parts[j]) && j > 0) j--
    if (!/\d/.test(parts[j])) return `${parts[j]}, ${abbr}`
  }
  return null
}

/** Store name without its location number: "QuikTrip #412" → "QuikTrip". */
export function chainName(name: string): string {
  return name.replace(/\s*(#|no\.?|store)\s*\d+.*$/i, '').replace(/\s+\d{2,}$/, '').trim() || name
}

/** Just the state: "OK", or null. */
export function stateOf(address: string | null | undefined): string | null {
  const cs = cityState(address)
  if (cs) return cs.slice(cs.lastIndexOf(', ') + 2)
  if (!address) return null
  const m = address.match(/\b([A-Z]{2})\b,?\s*\d{5}/)
  if (m && KNOWN_ABBRS.has(m[1])) return m[1]
  const lower = address.toLowerCase()
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) if (lower.includes(name)) return abbr
  return null
}
