import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// Public profile summary for /u/[username]: identity, counts, and whether the
// caller follows them. Posts are fetched client-side (RLS allows reading).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`community-profile:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const username = (req.nextUrl.searchParams.get('username') ?? '').toLowerCase()
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, created_at, is_verified_reporter, badges')
    .eq('username', username)
    .single()
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const count = async (q: any) => { const { count } = await q; return count ?? 0 }
  const [reports, storesAdded, followers, following, iFollow] = await Promise.all([
    count(supabaseAdmin.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)),
    count(supabaseAdmin.from('stores').select('id', { count: 'exact', head: true }).eq('submitted_by', profile.id).eq('status', 'approved')),
    count(supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('followed_id', profile.id)),
    count(supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id)),
    count(supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id).eq('followed_id', profile.id)),
  ])

  return NextResponse.json({
    profile: {
      id: profile.id,
      username: profile.username,
      joined: profile.created_at,
      verified: !!profile.is_verified_reporter,
      weeklyChampion: Array.isArray(profile.badges) && profile.badges.includes('weekly_champion'),
    },
    counts: { reports, storesAdded, followers, following },
    following: iFollow > 0,
  })
}
