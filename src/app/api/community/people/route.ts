import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// People lookups for the Community tab and profile pages:
//   ?q=name                        → username search (prefix matches first)
//   ?list=followers|following&user=<id> → who follows / is followed by <id>
// Each row says whether the caller already follows that person.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Row = { id: string; username: string; is_verified_reporter: boolean | null }

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
  let rows: Row[] = []

  if (list === 'followers' || list === 'following') {
    const target = params.get('user') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(target)) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    const [mine, other] = list === 'followers' ? ['followed_id', 'follower_id'] : ['follower_id', 'followed_id']
    const { data: links } = await supabaseAdmin.from('follows').select(other).eq(mine, target).limit(500)
    const ids = (links ?? []).map((l) => (l as unknown as Record<string, string>)[other])
    if (ids.length) {
      const { data } = await supabaseAdmin.from('profiles').select('id, username, is_verified_reporter').in('id', ids)
      rows = ((data ?? []) as Row[]).sort((a, b) => a.username.localeCompare(b.username))
    }
  } else {
    // Usernames are [a-z0-9_]; strip anything else so the ilike pattern stays literal.
    const q = (params.get('q') ?? '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 30)
    if (q.length < 2) return NextResponse.json({ people: [] })
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_verified_reporter')
      .ilike('username', `%${q.replace(/_/g, '\\_')}%`)
      .limit(40)
    rows = ((data ?? []) as Row[])
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

  return NextResponse.json({
    people: rows.map((r) => ({ id: r.id, username: r.username, verified: !!r.is_verified_reporter, following: followed.has(r.id), isMe: r.id === user.id })),
  })
}
