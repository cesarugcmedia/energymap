import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isMissingSchema, notify, notifyMentions } from '@/lib/community'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_BODY_LENGTH = 300

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

  if (!checkRateLimit(`community-comment:${user.id}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many comments — try again later.' }, { status: 429 })
  }

  const { post_id, body, parent_id, store_id } = await req.json().catch(() => ({}))
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!post_id || !trimmed || trimmed.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Comment must be 1–${MAX_BODY_LENGTH} characters.` }, { status: 400 })
  }

  // Replies attach to a top-level comment on the same post (one level deep).
  let parentAuthor: string | null = null
  let parentId: string | null = null
  if (typeof parent_id === 'string') {
    const { data: parent } = await supabaseAdmin.from('community_post_comments').select('id, post_id, user_id').eq('id', parent_id).single()
    if (parent && parent.post_id === post_id) { parentId = parent.id; parentAuthor = parent.user_id }
  }
  const storeId = typeof store_id === 'string' ? store_id : null

  const row: Record<string, unknown> = { post_id, user_id: user.id, body: trimmed }
  if (parentId || storeId) Object.assign(row, { parent_id: parentId, store_id: storeId })

  const { data: comment, error } = await supabaseAdmin
    .from('community_post_comments')
    .insert(row)
    .select('id, post_id, user_id, body, created_at')
    .single()

  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: 'Replies aren’t available yet.' }, { status: 400 })
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
  }

  const [{ data: post }, { data: me }] = await Promise.all([
    supabaseAdmin.from('community_posts').select('user_id').eq('id', post_id).single(),
    supabaseAdmin.from('profiles').select('username').eq('id', user.id).single(),
  ])
  const myName = me?.username ?? 'Someone'
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed

  // post_type is a v3 column — read it separately so a missing column can't
  // break notifications.
  let isLooking = false
  const { data: typeRow, error: typeErr } = await supabaseAdmin.from('community_posts').select('post_type').eq('id', post_id).single()
  if (!typeErr) isLooking = typeRow?.post_type === 'looking'

  const notified: string[] = []
  if (post && post.user_id !== user.id) {
    await notify(supabaseAdmin, {
      user_id: post.user_id,
      type: 'comment',
      post_id,
      message: isLooking
        ? `@${myName} answered your "looking for" post${storeId ? ' with a store' : ''}: "${preview}"`
        : `@${myName} commented on your post: "${preview}"`,
    })
    notified.push(post.user_id)
  }
  if (parentAuthor && parentAuthor !== user.id && !notified.includes(parentAuthor)) {
    await notify(supabaseAdmin, { user_id: parentAuthor, type: 'reply', post_id, message: `@${myName} replied to your comment: "${preview}"` })
    notified.push(parentAuthor)
  }
  await notifyMentions(supabaseAdmin, { text: trimmed, authorId: user.id, authorName: myName, postId: post_id, where: 'comment', skip: notified })

  return NextResponse.json({ comment: { ...comment, parent_id: parentId, store_id: storeId } })
}
