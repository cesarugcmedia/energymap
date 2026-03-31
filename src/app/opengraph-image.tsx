import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Amped Map — Find energy drinks near you'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#070710',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            display: 'flex',
          }}
        />

        {/* Green radial glow — top center */}
        <div
          style={{
            position: 'absolute',
            top: -160,
            left: '50%',
            marginLeft: -500,
            width: 1000,
            height: 500,
            background:
              'radial-gradient(ellipse at center, rgba(34,197,94,0.25) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Orange glow — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            right: -100,
            width: 600,
            height: 400,
            background:
              'radial-gradient(ellipse at center, rgba(249,115,22,0.12) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            gap: 0,
          }}
        >
          {/* Icon + name row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              marginBottom: 28,
            }}
          >
            {/* Lightning bolt badge */}
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: 28,
                backgroundColor: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 56,
                boxShadow: '0 0 60px rgba(34,197,94,0.5)',
              }}
            >
              ⚡
            </div>

            {/* App name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span
                style={{
                  fontSize: 88,
                  fontWeight: 900,
                  color: '#ffffff',
                  lineHeight: 1,
                  letterSpacing: -2,
                  fontFamily: 'sans-serif',
                }}
              >
                AMPED
              </span>
              <span
                style={{
                  fontSize: 88,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: -2,
                  fontFamily: 'sans-serif',
                  background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                  color: '#22c55e',
                }}
              >
                MAP
              </span>
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 26,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: 0.5,
              fontFamily: 'sans-serif',
              display: 'flex',
            }}
          >
            Find energy drinks near you — powered by the community
          </div>

          {/* Pills row */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 36,
            }}
          >
            {['Real-time stock', 'Nearby stores', 'Community reports'].map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  borderRadius: 99,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 18,
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: 'sans-serif',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom green bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 5,
            background: 'linear-gradient(90deg, #22c55e, #4ade80, #22c55e)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
