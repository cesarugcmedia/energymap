import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { searchKrogerProducts } from '@/lib/kroger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin ? user : null
}

// Kroger's product search requires a locationId to scope results — pass the
// id of any store you've already matched (fulfillment/price come back
// specific to that store, but the UPC itself is the same everywhere).
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const term = req.nextUrl.searchParams.get('term')
  const locationId = req.nextUrl.searchParams.get('locationId')
  if (!term || !locationId) {
    return NextResponse.json({ error: 'Missing term or locationId' }, { status: 400 })
  }

  try {
    const candidates = await searchKrogerProducts(term, locationId)
    return NextResponse.json({ candidates })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Kroger product search failed' }, { status: 502 })
  }
}
