import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_BODY_LENGTH = 500

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(`community-post:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many posts — try again later.' }, { status: 429 })
  }

  const { body, store_id, photo_url } = await req.json().catch(() => ({}))
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!trimmed || trimmed.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Post must be 1–${MAX_BODY_LENGTH} characters.` }, { status: 400 })
  }

  // Only accept photo URLs that actually point at our own storage bucket and
  // the caller's own upload folder — not an arbitrary external URL.
  const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/community-photos/${user.id}/`
  const safePhotoUrl = typeof photo_url === 'string' && photo_url.startsWith(expectedPrefix) ? photo_url : null

  const { data: post, error } = await supabaseAdmin
    .from('community_posts')
    .insert({ user_id: user.id, store_id: store_id || null, body: trimmed, photo_url: safePhotoUrl })
    .select('id, user_id, store_id, body, photo_url, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }

  return NextResponse.json({ post })
}
