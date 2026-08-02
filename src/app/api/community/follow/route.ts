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

  if (!checkRateLimit(`community-follow:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { user_id, following } = await req.json().catch(() => ({}))
  if (!user_id || user_id === user.id) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 })
  }

  if (following) {
    await supabaseAdmin
      .from('follows')
      .upsert({ follower_id: user.id, followed_id: user_id }, { onConflict: 'follower_id,followed_id' })
  } else {
    await supabaseAdmin
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followed_id', user_id)
  }

  return NextResponse.json({ ok: true })
}
