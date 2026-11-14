import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { geocode } from '@/lib/geocode'

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`geocode:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const address = req.nextUrl.searchParams.get('q')
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const result = await geocode(address)
  if (!result) return NextResponse.json({ error: 'Address not found' }, { status: 404 })
  return NextResponse.json(result)
}
