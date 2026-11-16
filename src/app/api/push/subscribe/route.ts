import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isMissingSchema } from '@/lib/community'

// Saves (POST) or removes ({ remove: true }) this device's web push
// subscription for the caller. Saving is Tracker-only; removing works for
// anyone, so a downgraded account can still switch it off.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`push-sub:${user.id}`, 20, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint.startsWith('https://') || endpoint.length > 1000) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })

  if (body.remove) {
    await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  }

  const p256dh = body.keys?.p256dh
  const auth = body.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('tier, is_admin').eq('id', user.id).single()
  if (!(profile?.is_admin || profile?.tier === 'tracker' || profile?.tier === 'admin')) {
    return NextResponse.json({ error: 'Push notifications are a Tracker feature' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, p256dh, auth, user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300) },
    { onConflict: 'endpoint' }
  )
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: 'not_ready' }, { status: 503 })
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
