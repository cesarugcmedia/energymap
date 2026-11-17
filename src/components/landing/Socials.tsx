import { DiscordIcon, MailIcon, TiktokIcon } from '@/components/Icons'
import styles from './landing.module.css'

// "Join the hunt" — the community channels, as big tappable cards near the
// end of the landing page. The Discord card goes live once
// NEXT_PUBLIC_DISCORD_URL (an invite link) is set; until then it reads
// "Coming soon".

export const SOCIAL = {
  tiktok: 'https://www.tiktok.com/@ampedmap',
  email: 'ampedmap@gmail.com',
  discord: process.env.NEXT_PUBLIC_DISCORD_URL || null,
}

export default function Socials() {
  const cards = [
    { key: 'tiktok', Icon: TiktokIcon, title: 'TikTok', sub: '@ampedmap · finds, drops and restocks', href: SOCIAL.tiktok, external: true },
    { key: 'discord', Icon: DiscordIcon, title: 'Discord', sub: SOCIAL.discord ? 'Chat with hunters near you' : 'Coming soon', href: SOCIAL.discord, external: true },
    { key: 'email', Icon: MailIcon, title: 'Email', sub: SOCIAL.email, href: `mailto:${SOCIAL.email}`, external: false },
  ]
  return (
    <section className={styles.section} aria-labelledby="socials">
      <div className={styles.container}>
        <h2 id="socials" className={`${styles.h2} reveal`}>Join the hunt</h2>
        <p className={styles.sectionLead}>Follow along for new flavor drops, big finds and app updates, or just say hi.</p>
        <div className={styles.socials}>
          {cards.map(({ key, Icon, title, sub, href, external }) => {
            const inner = (
              <>
                <span className={styles.socialIcon}><Icon size={24} color="#0D1210" /></span>
                <span className={styles.socialText}>
                  <span className={styles.socialTitle}>{title}</span>
                  <span className={styles.socialSub}>{sub}</span>
                </span>
              </>
            )
            return href ? (
              <a key={key} href={href} className={`${styles.socialCard} reveal`} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a>
            ) : (
              <div key={key} className={`${styles.socialCard} ${styles.socialSoon} reveal`} aria-disabled="true">{inner}</div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
