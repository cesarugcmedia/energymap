import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isMissingSchema } from '@/lib/community'

// Admin review queue for reported Community posts/comments.
// GET  → open reports with the reported content
// POST { action: 'hide' | 'unhide' | 'dismiss' | 'delete_comment', report_id?, post_id?, comment_id? }

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return null
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: reports, error } = await supabaseAdmin
    .from('community_reports')
    .select('id, post_id, comment_id, reporter_id, reason, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ enabled: false, reports: [] })
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }

  const postIds = [...new Set((reports ?? []).map((r) => r.post_id))]
  const commentIds = [...new Set((reports ?? []).map((r) => r.comment_id).filter(Boolean))] as string[]
  const [{ data: posts }, { data: comments }] = await Promise.all([
    postIds.length ? supabaseAdmin.from('community_posts').select('id, user_id, body, hidden_at, created_at').in('id', postIds) : Promise.resolve({ data: [] as any[] }),
    commentIds.length ? supabaseAdmin.from('community_post_comments').select('id, user_id, body').in('id', commentIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const userIds = [...new Set([
    ...(reports ?? []).map((r) => r.reporter_id),
    ...(posts ?? []).map((p: any) => p.user_id),
    ...(comments ?? []).map((c: any) => c.user_id),
  ])]
  const { data: profiles } = userIds.length ? await supabaseAdmin.from('profiles').select('id, username').in('id', userIds) : { data: [] as any[] }
  const name = new Map((profiles ?? []).map((p: any) => [p.id, p.username]))
  const postById = new Map((posts ?? []).map((p: any) => [p.id, p]))
  const commentById = new Map((comments ?? []).map((c: any) => [c.id, c]))

  return NextResponse.json({
    enabled: true,
    reports: (reports ?? []).map((r) => {
      const post = postById.get(r.post_id)
      const comment = r.comment_id ? commentById.get(r.comment_id) : null
      return {
        id: r.id,
        reason: r.reason,
        created_at: r.created_at,
        reporter: name.get(r.reporter_id) ?? 'someone',
        post_id: r.post_id,
        comment_id: r.comment_id,
        target: comment
          ? { kind: 'comment', body: comment.body, author: name.get(comment.user_id) ?? 'someone' }
          : { kind: 'post', body: post?.body ?? '(deleted)', author: post ? name.get(post.user_id) ?? 'someone' : '', hidden: !!post?.hidden_at },
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { action, report_id, post_id, comment_id } = await req.json().catch(() => ({}))

  if (action === 'hide' || action === 'unhide') {
    if (!post_id) return NextResponse.json({ error: 'Missing post_id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('community_posts').update({ hidden_at: action === 'hide' ? new Date().toISOString() : null }).eq('id', post_id)
    if (error) return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
    if (action === 'hide') await supabaseAdmin.from('community_reports').update({ resolved_at: new Date().toISOString() }).eq('post_id', post_id).is('resolved_at', null)
    return NextResponse.json({ success: true })
  }
  if (action === 'delete_comment') {
    if (!comment_id) return NextResponse.json({ error: 'Missing comment_id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('community_post_comments').delete().eq('id', comment_id)
    if (error) return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  if (action === 'dismiss') {
    if (!report_id) return NextResponse.json({ error: 'Missing report_id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('community_reports').update({ resolved_at: new Date().toISOString() }).eq('id', report_id)
    if (error) return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
