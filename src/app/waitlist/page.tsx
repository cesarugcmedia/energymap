import { createClient } from '@supabase/supabase-js'
import WaitlistForm from './WaitlistForm'

async function getCount(): Promise<number> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { count } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
    return count ?? 0
  } catch {
    return 0
  }
}

export const revalidate = 60

export default async function WaitlistPage() {
  const count = await getCount()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: '#070710',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Ambient glow */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,197,94,0.1) 0%, transparent 65%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, padding: '40px 28px 60px' }}>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div
            className="flex items-center justify-center w-11 h-11 rounded-xl text-xl"
            style={{ backgroundColor: '#0f0f1a', border: '1.5px solid rgba(34,197,94,0.4)' }}
          >
            ⚡
          </div>
          <span className="text-lg font-black text-white tracking-tight">Amped Map</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl font-black text-white leading-tight mb-4" style={{ letterSpacing: '-0.5px' }}>
          Find energy drinks<br />
          <span style={{ color: '#22c55e' }}>near you.</span>
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Community-powered stock tracking for your favorite energy drinks. See what's in stock at nearby stores — in real time.
        </p>

        {/* Features */}
        <div className="flex flex-col gap-2.5 mb-8">
          {[
            { icon: '🗺️', text: 'Live map of nearby stores' },
            { icon: '⚡', text: 'Real-time stock reports from the community' },
            { icon: '🔍', text: 'Search by brand, flavor, and location' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span style={{ fontSize: 15 }}>{icon}</span>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Social proof */}
        {count > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-full mb-5 w-fit"
            style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            <div className="relative w-2 h-2 shrink-0">
              <div className="animate-ping absolute inset-0 rounded-full opacity-50" style={{ backgroundColor: '#22c55e' }} />
              <div className="relative w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
            </div>
            <p className="text-xs font-bold" style={{ color: 'rgba(34,197,94,0.9)' }}>
              <span style={{ color: '#22c55e', fontSize: 13 }}>{count.toLocaleString()}</span> people waiting to join
            </p>
          </div>
        )}

        {/* Form */}
        <WaitlistForm />

        <p className="text-xs text-center mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
          No spam. We'll only email you when we launch.
        </p>
      </div>
    </div>
  )
}
