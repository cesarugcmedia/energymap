'use client'

export default function SubmitPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center gap-4" style={{ backgroundColor: '#070710', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <span style={{ fontSize: 48 }}>⚡</span>
      <p className="text-2xl font-black text-white">Coming Soon</p>
      <p className="text-sm text-white/40">Quick reporting is on its way.</p>
    </div>
  )
}
