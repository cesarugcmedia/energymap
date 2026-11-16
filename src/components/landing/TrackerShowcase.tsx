import Link from 'next/link'
import styles from './landing.module.css'

// Landing section selling Tracker with two drawn (not screenshotted) mockups,
// in the same spirit as PhoneMockup: a lock-screen restock notification and a
// store's restock-patterns card. Illustrative content, not live data.

const BARS = [2, 6, 3, 2, 4, 3, 1]
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function Bolt({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" />
    </svg>
  )
}

export default function TrackerShowcase() {
  return (
    <section className={styles.section} aria-labelledby="tracker">
      <div className={styles.container}>
        <h2 id="tracker" className={`${styles.h2} reveal`}>Be first to the cooler</h2>
        <p className={styles.sectionLead}>Tracker is for serious hunters. Know the minute a flavor is back, and when to go.</p>

        <div className={styles.showcase}>
          {/* Push restock alert */}
          <div className={`${styles.showcaseCard} reveal`}>
            <div className={styles.lockScreen} aria-hidden="true">
              <p className={styles.lockTime}>9:41</p>
              <p className={styles.lockDate}>Saturday, November 22</p>
              <div className={`${styles.notif} ${styles.notifMain}`}>
                <span className={styles.notifIcon}><Bolt /></span>
                <div className={styles.notifText}>
                  <p className={styles.notifTop}><strong>AmpedMap</strong><span>now</span></p>
                  <p className={styles.notifTitle}>Back in stock</p>
                  <p className={styles.notifBody}>Ultra Paradise is back in stock at QuikTrip!</p>
                </div>
              </div>
              <div className={`${styles.notif} ${styles.notifBehind}`}>
                <span className={styles.notifIcon}><Bolt /></span>
                <div className={styles.notifText}>
                  <p className={styles.notifTop}><strong>AmpedMap</strong><span>2h ago</span></p>
                  <p className={styles.notifBody}>Rio Punch is back in stock at Circle K!</p>
                </div>
              </div>
            </div>
            <h3 className={styles.h3}>Restock alerts on your phone</h3>
            <p className={styles.body}>Follow a flavor and get a notification the moment someone reports it back, even with the app closed.</p>
          </div>

          {/* Restock patterns */}
          <div className={`${styles.showcaseCard} reveal`}>
            <div className={styles.patternMock} aria-hidden="true">
              <p className={styles.patternLabel}>Restock patterns</p>
              <p className={styles.patternHeadline}>Usually restocked on Tuesdays, mostly mornings</p>
              <div className={styles.patternBars}>
                {BARS.map((v, i) => (
                  <div key={i} className={styles.patternCol}>
                    <span className={`${styles.patternBar} ${i === 1 ? styles.patternBarTop : ''}`} style={{ height: `${(v / 6) * 100}%`, ['--i' as string]: i }} />
                    <span className={i === 1 ? styles.patternDayTop : styles.patternDay}>{DAYS[i]}</span>
                  </div>
                ))}
              </div>
              <p className={styles.patternFoot}>Sells out fastest: Ultra Paradise, Rio Punch</p>
            </div>
            <h3 className={styles.h3}>Know when to go</h3>
            <p className={styles.body}>See which days each store usually restocks, and which flavors sell out first, so you show up at the right time.</p>
          </div>
        </div>

        <div className={styles.showcaseCta}>
          <Link href="/account?mode=signup&plan=tracker" className={styles.btnPrimary}>Get Tracker</Link>
          <a href="#pricing" className={styles.btnGhost}>Compare plans</a>
        </div>
      </div>
    </section>
  )
}
