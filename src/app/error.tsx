'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 52 }}>⚠️</span>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Something went wrong</p>
      <p style={{ fontSize: 14, color: 'var(--fg-40)', lineHeight: 1.6, margin: 0 }}>
        An unexpected error occurred.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          backgroundColor: '#C9F400',
          color: '#0D1210',
          fontWeight: 700,
          fontSize: 14,
          padding: '13px 32px',
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
