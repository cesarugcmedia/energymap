import CountUp from '@/components/ui/CountUp'
import Link from 'next/link'
import { PinIcon, DrinkIcon, LightningIcon, CheckIcon, MailIcon, TiktokIcon, DiscordIcon } from '@/components/Icons'
import PhoneMockup from './PhoneMockup'
import ZipPreview from './ZipPreview'
import LiveTicker from './LiveTicker'
import TrackerShowcase from './TrackerShowcase'
import StickyCta from './StickyCta'
import Socials, { SOCIAL } from './Socials'
import { FREE_FEATURES, TRACKER_FEATURES } from '@/lib/plans'
import styles from './landing.module.css'

export type LandingStats = { stores: number; drinks: number; trackers: number | null }

const BETA_LIMIT = 60

// Server-rendered marketing page shown at / to logged-out visitors (see
// HomeGate). Sign-in/sign-up live on /account; every CTA links there.

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span className={styles.logoMark} style={{ width: size, height: size, borderRadius: size * 0.28 }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" />
      </svg>
    </span>
  )
}

const STEPS = [
  { Icon: PinIcon, title: 'Find a store', body: 'Open the map to see gas stations, convenience stores and grocery stores around you.' },
  { Icon: DrinkIcon, title: "See what's been spotted", body: 'Each store shows which flavors people spotted, how many times today, and how long ago.' },
  { Icon: LightningIcon, title: 'Tap Spotted', body: 'Standing at a cooler? One tap per flavor logs a sighting. Not there counts too. Every sighting earns XP, and quiet stores pay bounties.' },
]


const FAQ = [
  { q: 'Is AmpedMap free?', a: 'Yes. Seeing sightings, logging them and adding stores are all free. Tracker ($5/month) is for serious hunters: push notifications when a flavor restocks, unlimited range and flavor alerts, sighting patterns for each store, and saved store lists. Every sighting earns XP toward badges and the leaderboard.' },
  { q: 'Where do sightings come from?', a: 'From people. When someone spots a flavor in a store’s cooler, they tap Spotted. If they looked and it was missing, they tap Not there. Every sighting shows how long ago it was, and older ones fade, so you can judge how fresh it is.' },
  { q: 'Which areas are covered?', a: 'Anywhere people log sightings. Coverage is strongest where the community is most active, and if a store is missing you can add it in a few seconds.' },
  { q: 'Do I have to share my location?', a: 'No. You can search by ZIP code instead. Sharing your location just makes it quicker to see what is closest.' },
]

export default function Landing({ stats }: { stats: LandingStats | null }) {
  const spotsLeft = stats?.trackers != null ? Math.max(0, BETA_LIMIT - stats.trackers) : null

  // Structured data so search engines can show the FAQ answers and site name
  // directly in results. Built from the same FAQ content rendered below.
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'AmpedMap', url: 'https://ampedmap.com' },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ]

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      {/* Header */}
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" className={styles.brand}>
            <LogoMark />
            <span>AmpedMap</span>
          </Link>
          <nav className={styles.headerNav}>
            <Link href="/account?mode=signin" className={styles.headerLink}>Sign in</Link>
            <Link href="/account?mode=signup" className={styles.btnSmall}>Get started</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section id="lp-hero" className={`${styles.container} ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>For energy drink hunters</p>
            <h1 className={styles.h1}>Never hunt for your favorite energy drink again.</h1>
            <p className={styles.lead}>
              See which stores near you have it in stock, spotted by people who just saw the shelf.
            </p>
            <div className={styles.heroCtas}>
              <Link href="/account?mode=signup" className={styles.btnPrimary}>Get started free</Link>
              <Link href="/account?mode=signin" className={styles.btnGhost}>Sign in</Link>
            </div>
            {stats && stats.stores > 0 && (
              <p className={styles.statLine}>
                <strong><CountUp value={stats.stores} /></strong> stores and <strong><CountUp value={stats.drinks} /></strong> flavors on the map
              </p>
            )}
          </div>
          <div className={styles.heroVisual}>
            <PhoneMockup />
          </div>
        </section>

        {/* Real recent reports, anonymous */}
        <LiveTicker />

        {/* Try it — no account needed */}
        <section className={styles.section} aria-labelledby="near">
          <div className={styles.container}>
            <h2 id="near" className={`${styles.h2} reveal`}>See what&apos;s near you</h2>
            <p className={styles.sectionLead} style={{ marginBottom: 0 }}>Check the stores around any ZIP code. No account needed.</p>
            <ZipPreview />
          </div>
        </section>

        {/* How it works */}
        <section className={styles.section} aria-labelledby="how">
          <div className={styles.container}>
            <h2 id="how" className={`${styles.h2} reveal`}>How it works</h2>
            <div className={styles.steps}>
              {STEPS.map(({ Icon, title, body }, i) => (
                <div key={title} className={`${styles.step} reveal`}>
                  <span className={styles.stepIcon}><Icon size={20} color="#C9F400" /></span>
                  <p className={styles.stepNum}>Step {i + 1}</p>
                  <h3 className={styles.h3}>{title}</h3>
                  <p className={styles.body}>{body}</p>
                </div>
              ))}
            </div>
            <div className={styles.legend}>
              <span><i style={{ background: '#C9F400' }} /> Spotted in the last day</span>
              <span><i style={{ background: '#FFB300' }} /> Mixed</span>
              <span><i style={{ background: '#6B7468' }} /> Older or no sightings</span>
            </div>
          </div>
        </section>

        {/* Tracker features, drawn */}
        <TrackerShowcase />

        {/* Pricing */}
        <section className={styles.section} aria-labelledby="pricing">
          <div className={styles.container}>
            <h2 id="pricing" className={`${styles.h2} reveal`}>Simple pricing</h2>
            <p className={styles.sectionLead}>Start free. Upgrade if you want the whole map.</p>
            <div className={styles.plans}>
              <div className={`${styles.plan} reveal`}>
                <h3 className={styles.planName}>Free</h3>
                <p className={styles.planPrice}>$0</p>
                <ul className={styles.planList}>
                  {FREE_FEATURES.map((f) => <li key={f}><CheckIcon size={15} color="#C9F400" />{f}</li>)}
                </ul>
                <Link href="/account?mode=signup&plan=free" className={styles.btnGhost}>Create free account</Link>
              </div>
              <div className={`${styles.plan} ${styles.planFeatured} reveal`}>
                <h3 className={styles.planName}>Tracker</h3>
                <p className={styles.planPrice}>$5<span>/month</span></p>
                <ul className={styles.planList}>
                  <li className={styles.planInherit}>Everything in Free, plus:</li>
                  {TRACKER_FEATURES.map((f) => <li key={f}><CheckIcon size={15} color="#C9F400" />{f}</li>)}
                </ul>
                {spotsLeft != null && spotsLeft > 0 && (
                  <p className={styles.betaNote}>The first {BETA_LIMIT} members get Tracker free. {spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left.</p>
                )}
                <Link href="/account?mode=signup&plan=tracker" className={styles.btnPrimary}>
                  {spotsLeft != null && spotsLeft > 0 ? 'Claim a free spot' : 'Get Tracker'}
                </Link>
                <p className={styles.planFine}>Cancel anytime.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Community channels */}
        <Socials />

        {/* Closing CTA */}

        <section id="lp-join" className={`${styles.container} ${styles.closing} reveal`}>
          <h2 className={styles.h2}>Stop guessing. Start finding.</h2>
          <Link href="/account?mode=signup" className={styles.btnPrimary}>Get started free</Link>
        </section>

        {/* FAQ */}
        <section id="lp-faq" className={styles.section} aria-labelledby="faq">
          <div className={`${styles.container} ${styles.narrow}`}>
            <h2 id="faq" className={`${styles.h2} reveal`}>Questions</h2>
            <div className={styles.faq}>
              {FAQ.map(({ q, a }) => (
                <details key={q} className={`${styles.faqItem} reveal`}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <StickyCta note="See what’s in stock near you" />

      {/* Footer */}
      <footer id="lp-footer" className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <Link href="/" className={styles.brand}>
            <LogoMark size={24} />
            <span>AmpedMap</span>
          </Link>
          <nav className={styles.footerNav}>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href={`mailto:${SOCIAL.email}`}><MailIcon size={14} color="currentColor" /> Contact</a>
            <a href={SOCIAL.tiktok} target="_blank" rel="noopener noreferrer"><TiktokIcon size={14} color="currentColor" /> TikTok</a>
            {SOCIAL.discord && <a href={SOCIAL.discord} target="_blank" rel="noopener noreferrer"><DiscordIcon size={14} color="currentColor" /> Discord</a>}
          </nav>
          <p className={styles.copyright}>© {new Date().getFullYear()} AmpedMap</p>
        </div>
      </footer>
    </div>
  )
}
