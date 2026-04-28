import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: 'linear-gradient(145deg, #0a0a14 0%, #0d1a12 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,197,94,0.22) 0%, transparent 70%)',
            top: 20,
            left: 30,
            display: 'flex',
          }}
        />
        <div style={{ fontSize: 78, lineHeight: 1, display: 'flex', marginBottom: 4 }}>⚡</div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: '#22c55e',
            letterSpacing: 4,
            display: 'flex',
            fontFamily: 'sans-serif',
          }}
        >
          AMPED
        </div>
      </div>
    ),
    { ...size }
  )
}
