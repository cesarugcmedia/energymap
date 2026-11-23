import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'AmpedMap — Find energy drinks in stock near you'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Link-preview image (iMessage, Slack, X, etc.). Matches the landing page.
// Plain hex colors only: ImageResponse can't resolve the site's CSS
// variables, so var(--text) etc. would render wrong here.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0A0B0A',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="44" height="44" viewBox="0 0 24 24">
              <path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" />
            </svg>
          </div>
          <span style={{ fontSize: 44, fontWeight: 700, color: '#F0F4E8', letterSpacing: -1 }}>AmpedMap</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ fontSize: 76, fontWeight: 800, color: '#F0F4E8', lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
            Never hunt for your favorite energy drink again.
          </span>
          <span style={{ fontSize: 32, color: '#A4B0A6' }}>
            See which stores near you have it in stock.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 24, color: '#A4B0A6' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: '#C9F400', display: 'flex' }} /> Fresh sightings
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: '#FFB300', display: 'flex' }} /> Nearby stores
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: '#6B7468', display: 'flex' }} /> Free to join
          </span>
          <span style={{ marginLeft: 'auto', color: '#C9F400', fontWeight: 600 }}>ampedmap.com</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
