import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isMissingSchema, notifyMentions } from '@/lib/community'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_BODY_LENGTH = 500
const MAX_PHOTOS = 4
const POST_TYPES = ['post', 'found', 'looking'] as const
const QUANTITIES = ['full', 'medium', 'low', 'out'] as const

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

  if (!checkRateLimit(`community-post:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many posts — try again later.' }, { status: 429 })
  }

  const input = await req.json().catch(() => ({}))
  const postType = POST_TYPES.includes(input.post_type) ? input.post_type as typeof POST_TYPES[number] : 'post'
  const drinkId = typeof input.drink_id === 'string' ? input.drink_id : null
  const quantity = QUANTITIES.includes(input.quantity) ? input.quantity as typeof QUANTITIES[number] : null
  const storeId = typeof input.store_id === 'string' ? input.store_id : null

  // Only accept photo URLs inside our own bucket AND the caller's own folder.
  const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/community-photos/${user.id}/`
  const rawPhotos: unknown[] = Array.isArray(input.photo_urls) ? input.photo_urls : input.photo_url ? [input.photo_url] : []
  const photos = rawPhotos.filter((u): u is string => typeof u === 'string' && u.startsWith(expectedPrefix)).slice(0, MAX_PHOTOS)

  if (postType === 'found' && (!storeId || !drinkId || !quantity)) {
    return NextResponse.json({ error: 'A "Found it" post needs a store, a drink and a stock level.' }, { status: 400 })
  }
  if (postType === 'looking' && !drinkId) {
    return NextResponse.json({ error: 'A "Looking for" post needs a drink.' }, { status: 400 })
  }

  let body = typeof input.body === 'string' ? input.body.trim() : ''
  // Found it / Looking for can be posted without text; generate a readable line.
  if (!body && (postType === 'found' || postType === 'looking') && drinkId) {
    const { data: drink } = await supabaseAdmin.from('drinks').select('brand, name, flavor').eq('id', drinkId).single()
    const label = drink ? `${drink.brand} ${drink.flavor || drink.name}` : 'this drink'
    body = postType === 'found' ? `Found ${label}!` : `Anyone seen ${label}?`
  }
  if (!body || body.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Post must be 1–${MAX_BODY_LENGTH} characters.` }, { status: 400 })
  }

  const usesV3 = postType !== 'post' || drinkId !== null || photos.length > 1
  const row: Record<string, unknown> = { user_id: user.id, store_id: storeId, body, photo_url: photos[0] ?? null }
  if (usesV3) Object.assign(row, { post_type: postType, drink_id: drinkId, quantity: postType === 'found' ? quantity : null, photo_urls: photos.length ? photos : null })

  const { data: post, error } = await supabaseAdmin
    .from('community_posts')
    .insert(row)
    .select('id, user_id, store_id, body, photo_url, created_at')
    .single()

  if (error) {
    if (isMissingSchema(error)) {
      return NextResponse.json({ error: 'That post type isn’t available yet.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }

  const { data: me } = await supabaseAdmin.from('profiles').select('username').eq('id', user.id).single()
  await notifyMentions(supabaseAdmin, { text: body, authorId: user.id, authorName: me?.username ?? 'someone', postId: post.id, where: 'post' })

  return NextResponse.json({ post })
}
