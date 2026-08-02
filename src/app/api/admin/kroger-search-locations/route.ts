import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { searchKrogerLocations, extractZipCode } from '@/lib/kroger'

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

// Suggests candidate Kroger locations for a store, searched by the zip code
// pulled from the store's own address — the admin still picks which (if any)
// candidate is actually the right match.
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const storeId = req.nextUrl.searchParams.get('storeId')
  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId' }, { status: 400 })
  }

  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id, name, address')
    .eq('id', storeId)
    .single()
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  const zip = extractZipCode(store.address)
  if (!zip) {
    return NextResponse.json({ error: 'Could not find a zip code in this store\'s address' }, { status: 400 })
  }

  try {
    const candidates = await searchKrogerLocations(zip)
    return NextResponse.json({ candidates })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Kroger location search failed' }, { status: 502 })
  }
}
