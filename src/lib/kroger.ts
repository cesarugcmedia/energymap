// Thin wrapper around Kroger's Products + Locations APIs (client-credentials
// grant only — no customer login/consent flow). Only used server-side.
//
// NOTE: exact query-param names below are based on Kroger's published API
// shape but haven't been exercised against a live account yet (no
// credentials were available while writing this). Re-check them against
// https://developer.kroger.com/reference once KROGER_CLIENT_ID/SECRET are
// live — a wrong param name usually still returns 200 with an empty result
// rather than an error, so a silent mismatch is the likely failure mode to
// watch for on the first real sync.

const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token'
const API_BASE = 'https://api.kroger.com/v1'

interface CachedToken {
  accessToken: string
  expiresAt: number
}

let cachedToken: CachedToken | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedToken.expiresAt - 30_000) {
    return cachedToken.accessToken
  }

  const clientId = process.env.KROGER_CLIENT_ID
  const clientSecret = process.env.KROGER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('KROGER_CLIENT_ID / KROGER_CLIENT_SECRET are not set')
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Kroger token request failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + (json.expires_in ?? 1800) * 1000,
  }
  return cachedToken.accessToken
}

async function krogerFetch(path: string): Promise<any> {
  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Kroger API request failed: ${res.status} ${path} ${text}`)
  }
  return res.json()
}

export interface KrogerLocation {
  locationId: string
  name: string
  address: string
  lat: number
  lng: number
}

// Search Kroger store locations near a zip code.
export async function searchKrogerLocations(zipCode: string, radiusMiles = 10, limit = 10): Promise<KrogerLocation[]> {
  const json = await krogerFetch(
    `/locations?filter.zipCode.near=${encodeURIComponent(zipCode)}&filter.radiusInMiles=${radiusMiles}&filter.limit=${limit}`
  )
  return (json.data ?? []).map((loc: any) => ({
    locationId: loc.locationId,
    name: loc.name,
    address: [loc.address?.addressLine1, loc.address?.city, loc.address?.state, loc.address?.zipCode]
      .filter(Boolean)
      .join(', '),
    lat: loc.geolocation?.latitude,
    lng: loc.geolocation?.longitude,
  }))
}

export interface KrogerProductAvailability {
  upc: string
  inStock: boolean
  price: number | null
}

// Look up a single product's in-store availability + price at one location.
export async function getKrogerProductAvailability(upc: string, locationId: string): Promise<KrogerProductAvailability | null> {
  const json = await krogerFetch(`/products/${encodeURIComponent(upc)}?filter.locationId=${encodeURIComponent(locationId)}`)
  const item = json.data
  if (!item) return null
  const fulfillment = item.items?.[0]?.fulfillment
  const price = item.items?.[0]?.price?.regular
  return {
    upc,
    inStock: !!fulfillment?.instore,
    price: typeof price === 'number' ? price : null,
  }
}

// Search Kroger's product catalog by free-text term, scoped to one location
// (used to find a drink's UPC in the first place).
export async function searchKrogerProducts(term: string, locationId: string, limit = 5): Promise<any[]> {
  const json = await krogerFetch(
    `/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=${limit}`
  )
  return json.data ?? []
}
