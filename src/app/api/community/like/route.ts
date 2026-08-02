import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  if (!checkRateLimit(`community-like:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { post_id, liked } = await req.json().catch(() => ({}))
  if (!post_id) {
    return NextResponse.json({ error: 'Missing post_id' }, { status: 400 })
  }

  if (liked) {
    await supabaseAdmin
      .from('community_post_likes')
      .upsert({ post_id, user_id: user.id }, { onConflict: 'post_id,user_id' })
  } else {
    await supabaseAdmin
      .from('community_post_likes')
      .delete()
      .eq('post_id', post_id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
