import Link from 'next/link'
import styles from './landing.module.css'

// Landing section with two drawn (not screenshotted) mockups, in the same
// spirit as PhoneMockup: the flavor collection (free for everyone) next to a
// store's restock-patterns card (Tracker). Each card carries its plan tag so
// the free feature isn't sold as a paid one. Illustrative content, not live
// data.

const BARS = [2, 6, 3, 2, 4, 3, 1]
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const BRANDS = [
  { name: 'Monster', found: 9, total: 12, chips: [['Ultra Paradise', true], ['Rio Punch', true], ['Ultra Fiesta', false]] },
  { name: 'Celsius', found: 6, total: 6, chips: [['Kiwi Guava', true], ['Peach Vibe', true], ['Arctic Vibe', true]], complete: true },
  { name: 'Ghost', found: 2, total: 8, chips: [['Sour Patch', true], ['Swedish Fish', false], ['Bubblicious', false]] },
] as const

export default function TrackerShowcase() {
  return (
    <section className={styles.section} aria-labelledby="tracker">
      <div className={styles.container}>
        <h2 id="tracker" className={`${styles.h2} reveal`}>Hunt smarter</h2>
        <p className={styles.sectionLead}>Fill your flavor collection one cooler at a time. With Tracker, see which days each store gets spotted.</p>

        <div className={styles.showcase}>
          {/* Flavor collection (free) */}
          <div className={`${styles.showcaseCard} reveal`}>
            <div className={styles.collectMock} aria-hidden="true">
              <p className={styles.patternLabel}>Flavor collection</p>
              {BRANDS.map((b, i) => (
                <div key={b.name} className={styles.collectBrand}>
                  <div className={styles.collectRow}>
                    <span className={styles.collectName}>{b.name}</span>
                    {'complete' in b && b.complete
                      ? <span className={styles.completeChip}>Complete</span>
                      : <span className={styles.collectCount}>{b.found} of {b.total}</span>}
                  </div>
                  <div className={styles.collectTrack}>
                    <span className={styles.collectFill} style={{ width: `${(b.found / b.total) * 100}%`, ['--i' as string]: i }} />
                  </div>
                  <div className={styles.collectChips}>
                    {b.chips.map(([name, found]) => (
                      <span key={name} className={found ? styles.flavorFound : styles.flavorMissing}>{name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <h3 className={styles.h3}>Collect every flavor <span className={styles.planTag}>Free</span></h3>
            <p className={styles.body}>Every flavor you find lights up in your collection. Finish a brand and it&apos;s marked complete on your profile.</p>
          </div>

          {/* Sighting patterns (Tracker) */}
          <div className={`${styles.showcaseCard} reveal`}>
            <div className={styles.patternMock} aria-hidden="true">
              <p className={styles.patternLabel}>Sighting patterns</p>
              <p className={styles.patternHeadline}>Most sightings on Tuesdays, mornings</p>
              <div className={styles.patternBars}>
                {BARS.map((v, i) => (
                  <div key={i} className={styles.patternCol}>
                    <span className={`${styles.patternBar} ${i === 1 ? styles.patternBarTop : ''}`} style={{ height: `${(v / 6) * 100}%`, ['--i' as string]: i }} />
                    <span className={i === 1 ? styles.patternDayTop : styles.patternDay}>{DAYS[i]}</span>
                  </div>
                ))}
              </div>
              <p className={styles.patternFoot}>Most often not found: Ultra Paradise, Rio Punch</p>
            </div>
            <h3 className={styles.h3}>Know when to go <span className={`${styles.planTag} ${styles.planTagTracker}`}>Tracker</span></h3>
            <p className={styles.body}>See which days flavors get spotted at each store, and which ones are most often missing, so you show up at the right time.</p>
          </div>
        </div>

        <div className={styles.showcaseCta}>
          <Link href="/account?mode=signup" className={styles.btnPrimary}>Get started free</Link>
          <a href="#pricing" className={styles.btnGhost}>Compare plans</a>
        </div>
      </div>
    </section>
  )
}
