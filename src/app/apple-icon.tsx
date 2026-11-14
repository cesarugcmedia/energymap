import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// iOS home-screen icon. Square and opaque on purpose: iOS applies its own
// rounded mask, and transparent corners would show up as black.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="104" height="104" viewBox="0 0 24 24">
          <path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
