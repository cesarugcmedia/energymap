import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`geocode:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const address = req.nextUrl.searchParams.get('q')
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const query = encodeURIComponent(address)

  // Primary: US Census Geocoding API
  try {
    const censusRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${query}&benchmark=Public_AR_Current&format=json`,
      { headers: { 'User-Agent': 'Amped Map/1.0' } }
    )
    const censusData = await censusRes.json()
    const match = censusData?.result?.addressMatches?.[0]
    if (match) {
      return NextResponse.json({ lat: match.coordinates.y, lng: match.coordinates.x })
    }
  } catch {
    // fall through to Nominatim
  }

  // Fallback: Nominatim
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': 'Amped Map/1.0' } }
    )
    const nomData = await nomRes.json()
    if (nomData && nomData.length > 0) {
      return NextResponse.json({ lat: parseFloat(nomData[0].lat), lng: parseFloat(nomData[0].lon) })
    }
  } catch {
    // fall through to error
  }

  return NextResponse.json({ error: 'Address not found' }, { status: 404 })
}
