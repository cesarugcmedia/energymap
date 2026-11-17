import Link from 'next/link'
import styles from './landing.module.css'

// Landing section selling Tracker with a drawn (not screenshotted) mockup of
// a store's restock-patterns card, in the same spirit as PhoneMockup.
// Illustrative content, not live data.

const BARS = [2, 6, 3, 2, 4, 3, 1]
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function TrackerShowcase() {
  return (
    <section className={styles.section} aria-labelledby="tracker">
      <div className={styles.container}>
        <h2 id="tracker" className={`${styles.h2} reveal`}>Be first to the cooler</h2>
        <p className={styles.sectionLead}>Tracker is for serious hunters. See when each store usually restocks, and plan your trip.</p>

        <div className={`${styles.showcase} ${styles.showcaseSingle}`}>
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
