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

  if (!checkRateLimit(`confirm:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { store_id, drink_id, confirmed } = await req.json().catch(() => ({}))
  if (!store_id || !drink_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (confirmed === null || confirmed === undefined) {
    await supabaseAdmin
      .from('stock_confirmations')
      .delete()
      .eq('store_id', store_id)
      .eq('drink_id', drink_id)
      .eq('user_id', user.id)
  } else {
    await supabaseAdmin
      .from('stock_confirmations')
      .upsert(
        { store_id, drink_id, user_id: user.id, confirmed },
        { onConflict: 'store_id,drink_id,user_id' }
      )
  }

  return NextResponse.json({ ok: true })
}
