import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_BODY_LENGTH = 300

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

  if (!checkRateLimit(`community-comment:${user.id}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many comments — try again later.' }, { status: 429 })
  }

  const { post_id, body } = await req.json().catch(() => ({}))
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!post_id || !trimmed || trimmed.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Comment must be 1–${MAX_BODY_LENGTH} characters.` }, { status: 400 })
  }

  const { data: comment, error } = await supabaseAdmin
    .from('community_post_comments')
    .insert({ post_id, user_id: user.id, body: trimmed })
    .select('id, post_id, user_id, body, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
  }

  return NextResponse.json({ comment })
}
