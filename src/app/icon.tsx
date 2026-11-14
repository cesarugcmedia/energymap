import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// App/tab icon: the AmpedMap logo mark (dark bolt on lime), full-bleed so it
// also works as the manifest's maskable icon — the bolt sits well inside the
// 80% safe zone that Android masks to.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 512, height: 512, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="280" height="280" viewBox="0 0 24 24">
          <path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
