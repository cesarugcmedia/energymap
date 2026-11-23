import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// GET /api/stores/reporters?store_id= → { reporters: { [drink_id]: username }, avatars: { [username]: url } }
// Who filed the most recent report for each flavor at a store, so the store
// page can show "by @name" linking to their profile. Signed-in callers only
// (profiles are a signed-in feature). Uses the service role because
// stock_reports' user_id and other users' profiles aren't readable via RLS.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`store-reporters:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const storeId = req.nextUrl.searchParams.get('store_id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return NextResponse.json({ error: 'Invalid store' }, { status: 400 })

  // Newest first; the first row seen per drink is the one latest_stock shows.
  const { data: reports, error } = await supabaseAdmin
    .from('stock_reports')
    .select('drink_id, user_id, reported_at')
    .eq('store_id', storeId)
    .order('reported_at', { ascending: false })
    .limit(1000)
  if (error) return NextResponse.json({ reporters: {} })

  const byDrink = new Map<string, string>()
  for (const r of reports ?? []) {
    if (r.drink_id && !byDrink.has(r.drink_id)) byDrink.set(r.drink_id, r.user_id)
  }
  const userIds = [...new Set([...byDrink.values()].filter(Boolean))]
  const names = new Map<string, string>()
  const avatars: Record<string, string> = {}
  if (userIds.length) {
    // Skip anyone who turned on "Keep my sightings private" (profile-v2).
    const ids = userIds.slice(0, 500)
    let res: { data: any[] | null; error: unknown } = await supabaseAdmin.from('profiles').select('id, username, anonymous_reports, avatar_url').in('id', ids)
    if (res.error) res = await supabaseAdmin.from('profiles').select('id, username').in('id', ids)
    for (const p of res.data ?? []) {
      if (!p.username || p.anonymous_reports) continue
      names.set(p.id, p.username)
      if (p.avatar_url) avatars[p.username] = p.avatar_url
    }
  }

  const reporters: Record<string, string> = {}
  for (const [drinkId, userId] of byDrink) {
    const name = userId ? names.get(userId) : undefined
    if (name) reporters[drinkId] = name
  }
  return NextResponse.json({ reporters, avatars })
}
