import { createClient } from '@supabase/supabase-js'

// Server-only loaders for shared links: store pages (/store/[id]) and posts
// (/p/[id]). Used by their link-preview metadata, preview images and the
// public post page. Service role, read-only, and only public-facing fields.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const RANK: Record<string, number> = { full: 3, medium: 2, low: 1, out: 0 }

export type Level = 'full' | 'medium' | 'low' | 'out'
export const LEVEL_HEX: Record<Level, string> = { full: '#C9F400', medium: '#FFB300', low: '#FFB300', out: '#FF4545' }
export const LEVEL_WORD: Record<Level, string> = { full: 'Full', medium: 'Medium', low: 'Low', out: 'Out' }

export type StoreCard = {
  id: string
  name: string
  address: string | null
  type: string | null
  inStock: number
  total: number
  latestAt: string | null
  top: { label: string; quantity: Level }[]
}

export async function loadStoreCard(id: string): Promise<StoreCard | null> {
  if (!UUID.test(id)) return null
  const db = admin()
  const { data: store } = await db.from('stores').select('id, name, address, type, status').eq('id', id).maybeSingle()
  if (!store || store.status !== 'approved') return null
  const { data: stock } = await db.from('latest_stock').select('drink_id, quantity, reported_at').eq('store_id', id).range(0, 999)
  const rows = stock ?? []
  const inStockRows = rows.filter((r) => r.quantity !== 'out')
  // Fullest, then freshest, first.
  inStockRows.sort((a, b) => (RANK[b.quantity] ?? 0) - (RANK[a.quantity] ?? 0) || String(b.reported_at).localeCompare(String(a.reported_at)))
  const topRows = inStockRows.slice(0, 4)
  const { data: drinks } = topRows.length
    ? await db.from('drinks').select('id, brand, name, flavor').in('id', topRows.map((r) => r.drink_id))
    : { data: [] as { id: string; brand: string; name: string; flavor: string | null }[] }
  const byId = new Map((drinks ?? []).map((d) => [d.id, d]))
  return {
    id: store.id,
    name: store.name,
    address: store.address ?? null,
    type: store.type ?? null,
    inStock: inStockRows.length,
    total: rows.length,
    latestAt: rows.reduce<string | null>((m, r) => (!m || r.reported_at > m ? r.reported_at : m), null),
    top: topRows.map((r) => {
      const d = byId.get(r.drink_id)
      return { label: d ? (d.flavor ? `${d.brand} ${d.flavor}` : d.name) : 'A flavor', quantity: r.quantity as Level }
    }),
  }
}

export type PostCard = {
  id: string
  username: string
  avatarUrl: string | null
  body: string
  createdAt: string
  postType: 'post' | 'found' | 'looking'
  photo: string | null
  quantity: Level | null
  drink: string | null
  store: { id: string; name: string; address: string | null } | null
}

export async function loadPostCard(id: string): Promise<PostCard | null> {
  if (!UUID.test(id)) return null
  const db = admin()
  // community-v3 columns first; fall back to v2 if that migration hasn't run.
  type Row = { id: string; user_id: string; body: string; created_at: string; store_id: string | null; photo_url: string | null; post_type?: string; drink_id?: string | null; quantity?: string | null; photo_urls?: string[] | null; hidden_at?: string | null }
  let post: Row | null = null
  const v3 = await db.from('community_posts').select('id, user_id, body, created_at, store_id, photo_url, post_type, drink_id, quantity, photo_urls, hidden_at').eq('id', id).maybeSingle()
  if (!v3.error) post = v3.data as Row | null
  else {
    const v2 = await db.from('community_posts').select('id, user_id, body, created_at, store_id, photo_url').eq('id', id).maybeSingle()
    post = v2.data as Row | null
  }
  if (!post || post.hidden_at) return null

  type ProfileLite = { username: string; avatar_url?: string | null }
  let profile = null as ProfileLite | null
  for (const cols of ['username, avatar_url', 'username']) {
    const r = await db.from('profiles').select(cols).eq('id', post.user_id).maybeSingle()
    if (!r.error) { profile = r.data as unknown as ProfileLite | null; break }
  }
  const [{ data: store }, { data: drink }] = await Promise.all([
    post.store_id ? db.from('stores').select('id, name, address').eq('id', post.store_id).maybeSingle() : Promise.resolve({ data: null }),
    post.drink_id ? db.from('drinks').select('brand, name, flavor').eq('id', post.drink_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const type = post.post_type === 'found' || post.post_type === 'looking' ? post.post_type : 'post'
  return {
    id: post.id,
    username: profile?.username ?? 'hunter',
    avatarUrl: profile?.avatar_url ?? null,
    body: post.body ?? '',
    createdAt: post.created_at,
    postType: type,
    photo: post.photo_urls?.[0] ?? post.photo_url ?? null,
    quantity: post.quantity && post.quantity in LEVEL_HEX ? (post.quantity as Level) : null,
    drink: drink ? (drink.flavor ? `${drink.brand} ${drink.flavor}` : drink.name) : null,
    store: store ? { id: store.id, name: store.name, address: store.address ?? null } : null,
  }
}

export function ago(iso: string | null): string | null {
  if (!iso) return null
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
