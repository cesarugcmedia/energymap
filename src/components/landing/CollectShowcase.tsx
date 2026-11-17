import { BADGE_DEFS } from '@/lib/badges'
import styles from './landing.module.css'

// Landing section: the game side of AmpedMap — badges, streaks and the flavor
// Collection — drawn (illustrative, not live data).

const SHOWN = ['founding_hunter', 'first_report', 'flavor_hunter', 'on_fire', 'night_owl', 'scout', 'unstoppable', 'weekly_champion']
const EARNED = new Set(['founding_hunter', 'first_report', 'flavor_hunter', 'on_fire', 'night_owl'])

const BRANDS = [
  { name: 'Monster', found: 9, total: 12, chips: [['Ultra Paradise', true], ['Rio Punch', true], ['Ultra Fiesta', false]] },
  { name: 'Celsius', found: 6, total: 6, chips: [['Kiwi Guava', true], ['Peach Vibe', true], ['Arctic Vibe', true]], complete: true },
  { name: 'Ghost', found: 2, total: 8, chips: [['Sour Patch', true], ['Swedish Fish', false], ['Bubblicious', false]] },
] as const

export default function CollectShowcase() {
  const badges = SHOWN.map((id) => BADGE_DEFS.find((b) => b.id === id)!).filter(Boolean)

  return (
    <section className={styles.section} aria-labelledby="collect">
      <div className={styles.container}>
        <h2 id="collect" className={`${styles.h2} reveal`}>Every find counts</h2>
        <p className={styles.sectionLead}>Earn badges, keep your streak alive and fill your flavor collection, one cooler at a time.</p>

        <div className={styles.showcase}>
          {/* Badges + streak */}
          <div className={`${styles.showcaseCard} reveal`}>
            <div className={styles.badgeMock} aria-hidden="true">
              <div className={styles.badgeMockHead}>
                <span className={styles.badgeMockTitle}>Badges</span>
                <span className={styles.streakChip}>🔥 7-day streak</span>
              </div>
              <div className={styles.badgeGrid}>
                {badges.map((b, i) => {
                  const on = EARNED.has(b.id)
                  return (
                    <div key={b.id} className={`${styles.badgeTile} ${on ? styles.badgeOn : ''}`} style={{ ['--b' as string]: b.color, ['--g' as string]: b.glow, ['--i' as string]: i }}>
                      <span className={styles.badgeIcon}>{b.icon}</span>
                      <span className={styles.badgeName}>{b.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <h3 className={styles.h3}>{BADGE_DEFS.length} badges to earn</h3>
            <p className={styles.body}>From your first report to Weekly Champion. Night owls, early birds and store scouts all get theirs.</p>
          </div>

          {/* Flavor collection */}
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
            <h3 className={styles.h3}>Collect every flavor</h3>
            <p className={styles.body}>Every flavor you find lights up in your collection. Finish a brand and it&apos;s marked complete on your profile.</p>
          </div>
        </div>

      </div>
    </section>
  )
}
