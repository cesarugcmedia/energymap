import { createClient } from '@supabase/supabase-js'
import WaitlistForm from './WaitlistForm'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getCount(): Promise<number> {
  try {
    const [{ count: waitlistCount }, { count: profileCount }] = await Promise.all([
      supabase.from('waitlist').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ])
    return (waitlistCount ?? 0) + (profileCount ?? 0)
  } catch {
    return 0
  }
}

async function getStats(): Promise<{ stores: number; drinks: number }> {
  try {
    const [{ count: stores }, { count: drinks }] = await Promise.all([
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('drinks').select('id', { count: 'exact', head: true }),
    ])
    return { stores: stores ?? 0, drinks: drinks ?? 0 }
  } catch {
    return { stores: 0, drinks: 0 }
  }
}

export const revalidate = 60

export default async function WaitlistPage() {
  const [count, stats] = await Promise.all([getCount(), getStats()])

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

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, padding: '40px 28px 60px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, fontSize: 20, backgroundColor: 'var(--surface)', border: '1.5px solid rgba(201,244,0,0.4)' }}
          >
            ⚡
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>Amped Map</span>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05, marginBottom: 16, color: 'var(--text)' }}>
          Find energy drinks<br />
          <span style={{ color: 'var(--accent)' }}>near you.</span>
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 32, color: 'var(--text-muted)' }}>
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
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Stats */}
        {(stats.stores > 0 || stats.drinks > 0) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {stats.stores > 0 && (
              <div style={{ flex: 1, borderRadius: 12, padding: '12px 14px', backgroundColor: 'rgba(201,244,0,0.05)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                  {stats.stores.toLocaleString()}+
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginTop: 4 }}>Stores Mapped</p>
              </div>
            )}
            {stats.drinks > 0 && (
              <div style={{ flex: 1, borderRadius: 12, padding: '12px 14px', backgroundColor: 'rgba(201,244,0,0.05)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                  {stats.drinks.toLocaleString()}+
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginTop: 4 }}>Drink Flavors</p>
              </div>
            )}
          </div>
        )}

        {/* Social proof */}
        {count > 0 && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 99, marginBottom: 20, width: 'fit-content', backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)' }}
          >
            <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <div className="animate-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', opacity: 0.5, backgroundColor: '#C9F400' }} />
              <div style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#C9F400' }} />
            </div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(201,244,0,0.9)' }}>
              <span style={{ color: 'var(--accent)', fontSize: 14 }}>{count.toLocaleString()}</span> people waiting to join
            </p>
          </div>
        )}

        {/* Form */}
        <WaitlistForm />

        <p style={{ fontSize: 12, textAlign: 'center', marginTop: 16, color: 'var(--text-dim)' }}>
          No spam. We'll only email you when we launch.
        </p>
      </div>
    </div>
  )
}
