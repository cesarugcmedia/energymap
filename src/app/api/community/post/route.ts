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

  const { body, store_id } = await req.json().catch(() => ({}))
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!trimmed || trimmed.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Post must be 1–${MAX_BODY_LENGTH} characters.` }, { status: 400 })
  }

  const { data: post, error } = await supabaseAdmin
    .from('community_posts')
    .insert({ user_id: user.id, store_id: store_id || null, body: trimmed })
    .select('id, user_id, store_id, body, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }

  return NextResponse.json({ post })
}
