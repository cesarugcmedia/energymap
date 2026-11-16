import { ImageResponse } from 'next/og'
import { LEVEL_HEX, LEVEL_WORD, loadPostCard } from '@/lib/shareCards'

export const alt = 'A post on AmpedMap'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

const TYPE_LABEL = { found: 'Found it', looking: 'Looking for', post: '' } as const

// Link preview for a shared Community post: who, what they found (drink +
// level + store), the text, and the photo when there is one. Literal hex
// colors only — ImageResponse can't resolve CSS variables.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await loadPostCard(id).catch(() => null)
  const body = post ? (post.body.length > 170 ? `${post.body.slice(0, 167)}…` : post.body) : 'Energy drink finds from hunters near you.'
  const label = post ? TYPE_LABEL[post.postType] : ''

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', backgroundColor: '#0A0B0A', fontFamily: 'sans-serif' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '56px 64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
            </div>
            <span style={{ fontSize: 30, fontWeight: 700, color: '#F0F4E8' }}>AmpedMap</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 40 }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: '#F0F4E8' }}>@{post?.username ?? 'hunter'}</span>
            {label && <span style={{ fontSize: 24, fontWeight: 700, color: '#0D1210', background: '#C9F400', borderRadius: 999, padding: '4px 16px' }}>{label}</span>}
          </div>

          {post?.drink && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 22 }}>
              <span style={{ fontSize: 50, fontWeight: 800, color: '#F0F4E8', letterSpacing: -1, lineHeight: 1.1 }}>{post.drink.slice(0, 34)}</span>
              {post.quantity && <span style={{ fontSize: 34, fontWeight: 800, color: LEVEL_HEX[post.quantity] }}>{LEVEL_WORD[post.quantity]}</span>}
            </div>
          )}

          <span style={{ fontSize: post?.drink ? 30 : 42, color: post?.drink ? '#A4B0A6' : '#F0F4E8', marginTop: 18, lineHeight: 1.35 }}>{body}</span>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', fontSize: 24, color: '#A4B0A6' }}>
            {post?.store ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F0F4E8', fontWeight: 600 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9F400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                {post.store.name.slice(0, 36)}
              </span>
            ) : <span>Energy drink hunters, sharing finds</span>}
            <span style={{ marginLeft: 'auto', color: '#C9F400', fontWeight: 600 }}>ampedmap.com</span>
          </div>
        </div>
        {post?.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.photo} width={420} height={630} alt="" style={{ objectFit: 'cover' }} />
        )}
      </div>
    ),
    { ...size }
  )
}
