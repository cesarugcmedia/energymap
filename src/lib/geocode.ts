// Server-side geocoding shared by /api/geocode (add-store, ZIP fallback on
// the map) and /api/preview (landing page "See what's near you").
// US Census first (free, no key), Nominatim as the fallback. Both resolve a
// bare 5-digit ZIP as well as full street addresses.

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(address)

  try {
    const censusRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${query}&benchmark=Public_AR_Current&format=json`,
      { headers: { 'User-Agent': 'Amped Map/1.0' } }
    )
    const censusData = await censusRes.json()
    const match = censusData?.result?.addressMatches?.[0]
    if (match) return { lat: match.coordinates.y, lng: match.coordinates.x }
  } catch {
    // fall through to Nominatim
  }

  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': 'Amped Map/1.0' } }
    )
    const nomData = await nomRes.json()
    if (nomData && nomData.length > 0) return { lat: parseFloat(nomData[0].lat), lng: parseFloat(nomData[0].lon) }
  } catch {
    // fall through
  }

  return null
}
