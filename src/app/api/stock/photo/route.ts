import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isMissingSchema } from '@/lib/community'

// POST /api/stock/photo { id, photo_url } — attach the optional photo to a
// Spotted sighting you logged in the last PHOTO_WINDOW_MS (+15 XP, counted by
// get_leaderboard). Only URLs in your own sighting-photos folder.

const PHOTO_WINDOW_MS = 30 * 60 * 1000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`sighting-photo:${user.id}`, 20, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const url = typeof body.photo_url === 'string' ? body.photo_url : ''
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sighting-photos/${user.id}/`
  if (!id || !url.startsWith(prefix) || url.length > 500) return NextResponse.json({ error: 'Invalid photo' }, { status: 400 })

  const res = await supabaseAdmin.from('stock_reports')
    .update({ photo_url: url })
    .eq('id', id).eq('user_id', user.id).eq('sighting', 'spotted')
    .gte('reported_at', new Date(Date.now() - PHOTO_WINDOW_MS).toISOString())
    .select('id')
  if (res.error) {
    if (isMissingSchema(res.error)) return NextResponse.json({ error: 'not_ready' }, { status: 503 })
    return NextResponse.json({ error: 'Could not attach the photo.' }, { status: 500 })
  }
  if (!res.data?.length) return NextResponse.json({ error: 'Too late to add a photo to this one.' }, { status: 410 })
  return NextResponse.json({ ok: true })
}
