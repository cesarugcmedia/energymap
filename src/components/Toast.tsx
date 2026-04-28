'use client'

export default function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(88px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 12}px)`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        zIndex: 9999,
        backgroundColor: '#1e1e2e',
        border: '1px solid rgba(255,255,255,0.13)',
        borderRadius: 999,
        padding: '9px 18px',
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      {message}
    </div>
  )
}
