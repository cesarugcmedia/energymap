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
        backgroundColor: 'var(--bg)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text)',
      }}
    >
      {/* Ambient glow */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 50% at 85% 10%, rgba(201,244,0,0.1) 0%, transparent 65%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, padding: '40px 28px 60px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, fontSize: 20, backgroundColor: 'var(--surface)', border: '1.5px solid rgba(201,244,0,0.4)' }}
          >
            ⚡
          </div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent)' }}>Amped Map</span>
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 44, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.05, marginBottom: 16, color: 'var(--text)' }}>
          Find energy drinks<br />
          <span style={{ color: 'var(--accent)' }}>near you.</span>
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 32, color: '#7A8F80' }}>
          Community-powered stock tracking for your favorite energy drinks. See what's in stock at nearby stores — in real time.
        </p>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {[
            { icon: '🗺️', text: 'Live map of nearby stores' },
            { icon: '⚡', text: 'Real-time stock reports from the community' },
            { icon: '🔍', text: 'Search by brand, flavor, and location' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#7A8F80' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Social proof */}
        {count > 0 && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 99, marginBottom: 20, width: 'fit-content', backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)' }}
          >
            <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <div className="animate-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', opacity: 0.5, backgroundColor: '#C9F400' }} />
              <div style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#C9F400' }} />
            </div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(201,244,0,0.9)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
              <span style={{ color: 'var(--accent)', fontSize: 14 }}>{count.toLocaleString()}</span> people waiting to join
            </p>
          </div>
        )}

        {/* Form */}
        <WaitlistForm />

        <p style={{ fontSize: 12, textAlign: 'center', marginTop: 16, color: '#4A5F50' }}>
          No spam. We'll only email you when we launch.
        </p>
      </div>
    </div>
  )
}
