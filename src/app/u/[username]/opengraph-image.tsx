import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const alt = 'AmpedMap profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

// Link preview for a shared profile (/u/[username]): photo or initial,
// @name, and three stats. Plain hex colors only — ImageResponse can't
// resolve CSS variables.

const AVATAR_HUES = ['#C9F400', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#34d399', '#facc15']

async function loadProfile(username: string) {
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return null
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  type P = { id: string; username: string; avatar_url?: string | null }
  let profile = null as P | null
  for (const cols of ['id, username, avatar_url', 'id, username']) {
    const res = await admin.from('profiles').select(cols).eq('username', username).maybeSingle()
    if (!res.error) { profile = res.data as unknown as P | null; break }
  }
  if (!profile) return null
  const found: P = profile
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await q; return r.error ? null : r.count ?? 0 }
  const [reports, flavors, followers] = await Promise.all([
    count(admin.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', found.id)),
    count(admin.from('flavor_finds').select('drink_id', { count: 'exact', head: true }).eq('user_id', found.id)),
    count(admin.from('follows').select('id', { count: 'exact', head: true }).eq('followed_id', found.id)),
  ])
  return { ...found, reports: reports ?? 0, flavors, followers: followers ?? 0 }
}

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const p = await loadProfile(username.toLowerCase()).catch(() => null)
  const name = p?.username ?? username.toLowerCase()
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = AVATAR_HUES[h % AVATAR_HUES.length]
  const stats: [string, number][] = p
    ? [['sightings', p.reports], ...(p.flavors != null ? [['flavors found', p.flavors] as [string, number]] : []), ['followers', p.followers]]
    : []

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: '#0A0B0A', padding: '64px 80px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
          </div>
          <span style={{ fontSize: 36, fontWeight: 700, color: '#F0F4E8' }}>AmpedMap</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {p?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatar_url} width={220} height={220} alt="" style={{ borderRadius: 110, objectFit: 'cover', border: '6px solid #C9F400' }} />
          ) : (
            <div style={{ width: 220, height: 220, borderRadius: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${hue}22`, color: hue, fontSize: 110, fontWeight: 800 }}>
              {name[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <span style={{ fontSize: 80, fontWeight: 800, color: '#F0F4E8', letterSpacing: -2 }}>@{name}</span>
            <div style={{ display: 'flex', gap: 40 }}>
              {stats.map(([label, n]) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 52, fontWeight: 800, color: '#C9F400' }}>{n.toLocaleString('en-US')}</span>
                  <span style={{ fontSize: 26, color: '#A4B0A6' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: '#A4B0A6' }}>
          <span>Energy drink hunter on AmpedMap</span>
          <span style={{ marginLeft: 'auto', color: '#C9F400', fontWeight: 600 }}>ampedmap.com/u/{name}</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
