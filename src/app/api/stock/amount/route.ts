import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isMissingSchema } from '@/lib/community'

// POST /api/stock/amount { id, amount: 'few' | 'plenty' | null }
// The optional "Just a few / Plenty" picked after tapping Spotted. Spotted
// saves right away; this only adds the amount afterwards. Only your own
// Spotted report, and only within AMOUNT_WINDOW_MS of saving it.

const AMOUNT_WINDOW_MS = 10 * 60 * 1000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`amount:${user.id}`, 60, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const amount = body.amount === 'few' || body.amount === 'plenty' ? body.amount : null
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const since = new Date(Date.now() - AMOUNT_WINDOW_MS).toISOString()
  let res = await supabaseAdmin.from('stock_reports')
    .update({ amount })
    .eq('id', id).eq('user_id', user.id).eq('sighting', 'spotted').gte('reported_at', since)
    .select('id')
  if (res.error && isMissingSchema(res.error)) {
    // scripts/sightings.sql not run yet: keep the old level in step.
    res = await supabaseAdmin.from('stock_reports')
      .update({ quantity: amount === 'plenty' ? 'full' : amount === 'few' ? 'low' : 'medium' })
      .eq('id', id).eq('user_id', user.id).neq('quantity', 'out').gte('reported_at', since)
      .select('id')
  }
  if (res.error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  if (!res.data?.length) return NextResponse.json({ error: 'Too late to change this one.' }, { status: 410 })
  return NextResponse.json({ ok: true })
}
