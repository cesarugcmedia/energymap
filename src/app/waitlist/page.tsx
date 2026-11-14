import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import WaitlistForm from './WaitlistForm'
import PhoneMockup from '@/components/landing/PhoneMockup'
import { PinIcon, LightningIcon, BellIcon } from '@/components/Icons'
import styles from '@/components/landing/landing.module.css'

export const metadata: Metadata = {
  title: 'Join the waitlist · AmpedMap',
  description: 'AmpedMap is letting people in from the waitlist. Join to find out which stores near you have your favorite energy drinks in stock.',
}

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

const FEATURES = [
  { Icon: PinIcon, title: 'Every store near you', body: 'Gas stations, convenience and grocery stores on one live map.' },
  { Icon: LightningIcon, title: 'What’s in the cooler', body: 'Flavors and stock levels reported by people who just saw the shelf.' },
  { Icon: BellIcon, title: 'Restock alerts', body: 'Follow a flavor and get told when it’s back.' },
]

// Waitlist page (invite-only mode). Same visual language as the landing page:
// reuses its stylesheet and phone mockup so the two stay consistent.
export default async function WaitlistPage() {
  const [count, stats] = await Promise.all([getCount(), getStats()])

  return (
    <div className={styles.page} style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto' }}>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" className={styles.brand}>
            <span className={styles.logoMark} style={{ width: 30, height: 30, borderRadius: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
            </span>
            <span>AmpedMap</span>
          </Link>
          <nav className={styles.headerNav}>
            <Link href="/account?mode=signin" className={styles.headerLink}>Sign in</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={`${styles.container} ${styles.hero}`}>
          <div>
            <p className={styles.eyebrow}>Invite only, for now</p>
            <h1 className={styles.h1}>Never hunt for your favorite energy drink again.</h1>
            <p className={styles.lead}>
              We&apos;re letting people in from the waitlist. Add your email and we&apos;ll send your invite when your spot opens.
            </p>

            <div style={{ maxWidth: 440 }}>
              <WaitlistForm />
            </div>

            {count > 0 && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 15, color: 'var(--lp-muted)' }}>
                <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                  <span className="animate-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', opacity: 0.5, backgroundColor: '#C9F400' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#C9F400' }} />
                </span>
                <span><strong style={{ color: 'var(--lp-text)', fontWeight: 600 }}>{count.toLocaleString()}</strong> people are already waiting</span>
              </p>
            )}
            {(stats.stores > 0 || stats.drinks > 0) && (
              <p className={styles.statLine} style={{ marginTop: 6 }}>
                {stats.stores > 0 && <><strong>{stats.stores.toLocaleString()}</strong> stores</>}
                {stats.stores > 0 && stats.drinks > 0 && ' and '}
                {stats.drinks > 0 && <><strong>{stats.drinks.toLocaleString()}</strong> flavors</>} already on the map
              </p>
            )}
          </div>
          <div className={styles.heroVisual}>
            <PhoneMockup />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="what">
          <div className={styles.container}>
            <h2 id="what" className={`${styles.h2} reveal`}>What you&apos;ll get</h2>
            <div className={styles.steps}>
              {FEATURES.map(({ Icon, title, body }) => (
                <div key={title} className={`${styles.step} reveal`}>
                  <span className={styles.stepIcon}><Icon size={20} color="#C9F400" /></span>
                  <h3 className={styles.h3}>{title}</h3>
                  <p className={styles.body}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <Link href="/" className={styles.brand}>
            <span className={styles.logoMark} style={{ width: 24, height: 24, borderRadius: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
            </span>
            <span>AmpedMap</span>
          </Link>
          <nav className={styles.footerNav}>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="mailto:support@ampedmap.com">Contact</a>
          </nav>
          <p className={styles.copyright}>No spam. We only email you about your invite.</p>
        </div>
      </footer>
    </div>
  )
}
