import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// People lookups for the Community tab and profile pages:
//   ?q=name                             → username search (prefix matches first)
//   ?list=followers|following&user=<id> → who follows / is followed by <id>
//   ?suggest=1                          → people worth following, with a reason
// Each row says whether the caller already follows that person. Search and
// suggestions skip anyone who turned on "Hide me from people search"
// (profiles.hide_from_search, scripts/profile-v2.sql).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Row = { id: string; username: string; is_verified_reporter: boolean | null; avatar_url?: string | null; hide_from_search?: boolean | null }

const MI = 1609.34
const COLS = 'id, username, is_verified_reporter, avatar_url, hide_from_search'
const BASE_COLS = 'id, username, is_verified_reporter'

// Select with the profile-v2 columns, falling back before that script runs.
async function profilesWhere(apply: (q: any) => any): Promise<Row[]> {
  const full = await apply(supabaseAdmin.from('profiles').select(COLS))
  if (!full.error) return full.data ?? []
  const base = await apply(supabaseAdmin.from('profiles').select(BASE_COLS))
  return base.data ?? []
}

async function suggestions(userId: string): Promise<{ rows: Row[]; reasons: Map<string, string> }> {
  const reasons = new Map<string, string>()
  const score = new Map<string, number>()
  const bump = (id: string, pts: number, reason: string) => {
    if (!id || id === userId) return
    score.set(id, (score.get(id) ?? 0) + pts)
    if (!reasons.has(id)) reasons.set(id, reason)
  }

  // select('*') so optional columns (home_lat, favorite_brands) don't break it.
  const { data: me } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle()
  const lat = typeof me?.last_lat === 'number' ? me.last_lat : typeof me?.home_lat === 'number' ? me.home_lat : null
  const lng = typeof me?.last_lng === 'number' ? me.last_lng : typeof me?.home_lng === 'number' ? me.home_lng : null

  // 1. Regulars at stores you saved.
  const { data: favs } = await supabaseAdmin.from('favorites').select('store_id').eq('user_id', userId).limit(50)
  const favIds = (favs ?? []).map((f) => f.store_id)
  if (favIds.length) {
    const [{ data: reps }, { data: stores }] = await Promise.all([
      supabaseAdmin.from('stock_reports').select('user_id, store_id').in('store_id', favIds).order('reported_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('stores').select('id, name').in('id', favIds),
    ])
    const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]))
    for (const r of reps ?? []) bump(r.user_id, 3, `Regular at ${storeName.get(r.store_id) ?? 'a store you saved'}`)
  }

  // 2. Active reporters within 10 miles of you.
  if (lat != null && lng != null) {
    const dLat = (10 * MI) / 111320
    const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.2)
    const { data: near } = await supabaseAdmin.from('stores').select('id').eq('status', 'approved')
      .gte('lat', lat - dLat).lte('lat', lat + dLat).gte('lng', lng - dLng).lte('lng', lng + dLng).limit(300)
    const nearIds = (near ?? []).map((s) => s.id)
    if (nearIds.length) {
      const { data: reps } = await supabaseAdmin.from('stock_reports').select('user_id').in('store_id', nearIds).order('reported_at', { ascending: false }).limit(1000)
      for (const r of reps ?? []) bump(r.user_id, 1, 'Reports near you')
    }
  }

  // 3. Same favorite brands (onboarding answers; column may not exist yet).
  const brands: string[] = Array.isArray(me?.favorite_brands) ? me.favorite_brands.slice(0, 10) : []
  if (brands.length) {
    const { data: fans, error } = await supabaseAdmin.from('profiles').select('id, favorite_brands').overlaps('favorite_brands', brands).limit(40)
    if (!error) for (const f of fans ?? []) {
      const shared = (f.favorite_brands as string[]).find((b) => brands.includes(b))
      bump(f.id, 2, `Also into ${shared}`)
    }
  }

  // 4. Fill with the most active hunters overall.
  if (score.size < 8) {
    const { data: reps } = await supabaseAdmin.from('stock_reports').select('user_id').order('reported_at', { ascending: false }).limit(1000)
    for (const r of reps ?? []) bump(r.user_id, 0.1, 'Active hunter')
  }

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 60)
  const rows = ranked.length ? await profilesWhere((q) => q.in('id', ranked)) : []
  const order = new Map(ranked.map((id, i) => [id, i]))
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  return { rows, reasons }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`community-people:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const params = req.nextUrl.searchParams
  const list = params.get('list')
  const suggest = params.get('suggest') === '1'
  let rows: Row[] = []
  let reasons = new Map<string, string>()

  if (list === 'followers' || list === 'following') {
    const target = params.get('user') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(target)) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    const [mine, other] = list === 'followers' ? ['followed_id', 'follower_id'] : ['follower_id', 'followed_id']
    const { data: links } = await supabaseAdmin.from('follows').select(other).eq(mine, target).limit(500)
    const ids = (links ?? []).map((l) => (l as unknown as Record<string, string>)[other])
    if (ids.length) rows = (await profilesWhere((q) => q.in('id', ids))).sort((a, b) => a.username.localeCompare(b.username))
  } else if (suggest) {
    ;({ rows, reasons } = await suggestions(user.id))
    rows = rows.filter((r) => !r.hide_from_search)
  } else {
    // Usernames are [a-z0-9_]; strip anything else so the ilike pattern stays literal.
    const q = (params.get('q') ?? '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 30)
    if (q.length < 2) return NextResponse.json({ people: [] })
    rows = (await profilesWhere((query) => query.ilike('username', `%${q.replace(/_/g, '\\_')}%`).limit(40)))
      .filter((r) => !r.hide_from_search || r.id === user.id)
      .sort((a, b) => Number(!a.username.startsWith(q)) - Number(!b.username.startsWith(q)) || a.username.length - b.username.length)
      .slice(0, 20)
  }

  // Hide anyone the caller has blocked (table only exists after community-v3).
  const { data: blocks, error: blockErr } = await supabaseAdmin.from('user_blocks').select('blocked_id').eq('blocker_id', user.id)
  const blocked = new Set(blockErr ? [] : (blocks ?? []).map((b) => b.blocked_id))
  rows = rows.filter((r) => !blocked.has(r.id))

  const ids = rows.map((r) => r.id)
  const { data: myFollows } = ids.length
    ? await supabaseAdmin.from('follows').select('followed_id').eq('follower_id', user.id).in('followed_id', ids)
    : { data: [] as { followed_id: string }[] }
  const followed = new Set((myFollows ?? []).map((f) => f.followed_id))

  // Suggestions: only people you don't follow yet.
  if (suggest) rows = rows.filter((r) => !followed.has(r.id) && r.id !== user.id).slice(0, 12)

  return NextResponse.json({
    people: rows.map((r) => ({
      id: r.id, username: r.username, verified: !!r.is_verified_reporter, avatarUrl: r.avatar_url ?? null,
      following: followed.has(r.id), isMe: r.id === user.id, reason: reasons.get(r.id) ?? null,
    })),
  })
}
