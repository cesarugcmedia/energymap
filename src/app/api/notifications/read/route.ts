import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// Marks the caller's notifications read: `{ ids: string[] }` for specific
// rows, or `{ all: true }` for every unread one. Runs with the service role
// (scoped to the caller's user_id) so it works regardless of the
// notifications table's RLS update policy, which isn't defined in this repo.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`notif-read:${user.id}`, 120, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  let q = supabaseAdmin.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
  if (!body.all) {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 500) : []
    if (ids.length === 0) return NextResponse.json({ updated: 0 })
    q = q.in('id', ids)
  }
  const { data, error } = await q.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0 })
}
