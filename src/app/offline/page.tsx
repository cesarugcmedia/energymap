export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#070710',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 52 }}>⚡</span>
      <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0 }}>You're Offline</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, margin: 0 }}>
        Check your connection and try again.
      </p>
    </div>
  )
}
