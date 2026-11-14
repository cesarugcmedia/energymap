'use client'

export default function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(88px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 14}px) scale(${visible ? 1 : 0.96})`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.24s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        zIndex: 9999,
        backgroundColor: 'var(--surface3)',
        border: '1px solid var(--fg-13)',
        borderRadius: 999,
        padding: '9px 18px',
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      {message}
    </div>
  )
}
