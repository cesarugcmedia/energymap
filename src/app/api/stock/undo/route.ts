import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// Undo a sighting you just logged: deletes the given report ids, but only
// your own and only within UNDO_WINDOW_MS of being reported. latest_stock
// then falls back to whatever was reported before. Notifications that the
// report already triggered (restock alerts, stock updates, badges) are not
// pulled back.

const UNDO_WINDOW_MS = 5 * 60 * 1000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`undo:${user.id}`, 20, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : []
  if (ids.length === 0) return NextResponse.json({ error: 'Nothing to undo' }, { status: 400 })

  const since = new Date(Date.now() - UNDO_WINDOW_MS - 30 * 1000).toISOString() // small grace for clock/network lag
  const { data, error } = await supabaseAdmin
    .from('stock_reports')
    .delete()
    .in('id', ids)
    .eq('user_id', user.id)
    .gte('reported_at', since)
    .select('id')
  if (error) return NextResponse.json({ error: 'Could not undo' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Too late to undo this.' }, { status: 410 })
  return NextResponse.json({ undone: data.length })
}
