import { ImageResponse } from 'next/og'
import { ago, LEVEL_HEX, LEVEL_WORD, loadStoreCard } from '@/lib/shareCards'

export const alt = 'What’s in stock on AmpedMap'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// Stock changes through the day; previews refresh every 10 minutes.
export const revalidate = 600

// Link preview for a shared store: name, "N flavors in stock", the fullest
// flavors with their level, and report freshness. Literal hex colors only —
// ImageResponse can't resolve CSS variables.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const card = await loadStoreCard(id).catch(() => null)
  const fresh = ago(card?.latestAt ?? null)
  const freshHours = card?.latestAt ? (Date.now() - new Date(card.latestAt).getTime()) / 3600000 : Infinity
  const freshColor = freshHours < 24 ? '#C9F400' : freshHours < 72 ? '#FFB300' : '#7E8A80'

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0A0B0A', padding: '56px 72px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, color: '#F0F4E8' }}>AmpedMap</span>
          {fresh && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, color: '#A4B0A6' }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: freshColor }} />
              Reported {fresh}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: '#F0F4E8', letterSpacing: -1.5, lineHeight: 1.05 }}>{(card?.name ?? 'A store').slice(0, 40)}</span>
          {card?.address && <span style={{ fontSize: 26, color: '#7E8A80', marginTop: 8 }}>{card.address.slice(0, 70)}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 30 }}>
          <span style={{ fontSize: 72, fontWeight: 800, color: '#C9F400' }}>{card?.inStock ?? 0}</span>
          <span style={{ fontSize: 32, color: '#A4B0A6' }}>{card && card.total > 0 ? `of ${card.total} flavors in stock` : 'flavors reported yet'}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 18 }}>
          {(card?.top ?? []).map((t) => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 26, color: '#F0F4E8' }}>{t.label.slice(0, 32)}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: LEVEL_HEX[t.quantity] }}>{LEVEL_WORD[t.quantity]}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 24, color: '#A4B0A6' }}>
          <span>Live energy drink stock, reported by hunters</span>
          <span style={{ marginLeft: 'auto', color: '#C9F400', fontWeight: 600 }}>ampedmap.com</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
