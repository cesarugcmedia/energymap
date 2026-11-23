import { XP_BOUNTY, XP_PHOTO, XP_SIGHTING } from '@/lib/xp'
import { EyeIcon, LightningIcon } from '@/components/Icons'
import styles from './landing.module.css'

// Landing: the game side of sightings — XP per sighting, bounties on quiet
// stores, and the weekly store Plug. Numbers come from src/lib/xp.ts.
export default function EarnShowcase() {
  return (
    <section className={styles.section} aria-labelledby="earn">
      <div className={styles.container}>
        <h2 id="earn" className={`${styles.h2} reveal`}>Earn as you hunt</h2>
        <p className={styles.sectionLead}>Every sighting helps the next person, and it counts for you too.</p>
        <div className={styles.earn}>
          <div className={`${styles.earnCard} reveal`}>
            <span className={`${styles.earnBadge} ${styles.earnXp}`}><EyeIcon size={15} color="#0D1210" /> +{XP_SIGHTING} XP</span>
            <h3 className={styles.h3}>XP for every sighting</h3>
            <p className={styles.body}>Spotted or Not there, each one earns {XP_SIGHTING} XP. Add a photo for {XP_PHOTO} more. XP ranks you on the weekly leaderboard.</p>
          </div>
          <div className={`${styles.earnCard} reveal`}>
            <span className={`${styles.earnBadge} ${styles.earnBounty}`}>+{XP_BOUNTY}</span>
            <h3 className={styles.h3}>Bounties on quiet stores</h3>
            <p className={styles.body}>When nobody&apos;s checked a store in two days, the next sighting there pays a {XP_BOUNTY} XP bounty. Find them on the map.</p>
          </div>
          <div className={`${styles.earnCard} reveal`}>
            <span className={`${styles.earnBadge} ${styles.earnPlug}`}><LightningIcon size={14} color="#C9F400" /> Plug</span>
            <h3 className={styles.h3}>Become a store&apos;s Plug</h3>
            <p className={styles.body}>Log the most sightings at a store this week and you&apos;re its Plug, shown on the store page and your profile.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
