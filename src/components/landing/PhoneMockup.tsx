import { EyeIcon, SearchIcon } from '@/components/Icons'
import styles from './landing.module.css'

// Static illustration of the map screen for the landing page — drawn with the
// app's real palette, pin styles and freshness colors rather than a screenshot,
// so it stays sharp at any size and needs no image asset. The store and
// sightings shown are illustrative, not live data.

const LIME = '#C9F400'
const RED = '#FF6B6B'

// Pin/cluster coordinates are in the map SVG's 270×330 space; the map fills
// the top MAP_H of the screen, so convert to screen percentages with these.
const MAP_H = 0.58
const px = (x: number) => `${(x / 270) * 100}%`
const py = (y: number) => `${(y / 330) * MAP_H * 100}%`

// Same pin language as the real map (MapView): fresh = lime eye + today's
// count, older = gray age, Not there = red Out, bounty = dashed +50.
const PINS: { x: number; y: number; kind: 'fresh' | 'older' | 'out' | 'bounty'; n?: number; label?: string }[] = [
  { x: 150, y: 80, kind: 'fresh', n: 8 },
  { x: 222, y: 236, kind: 'fresh', n: 3 },
  { x: 52, y: 126, kind: 'bounty', label: '+50' },
  { x: 62, y: 270, kind: 'older', label: '1d' },
  { x: 214, y: 156, kind: 'out' },
]

const STOCK = [
  { brand: 'Celsius', flavor: 'Sparkling Kiwi Guava', level: 'Plenty', color: LIME },
  { brand: 'Alani Nu', flavor: 'Cherry Slush', level: 'Spotted', color: LIME },
  { brand: 'Ghost', flavor: 'Sour Patch Kids Blue Raspberry', level: 'Not there', color: RED },
]

export default function PhoneMockup() {
  return (
    <div className={styles.phone} role="img" aria-label="AmpedMap on a phone: a map of nearby stores with sighting pins, and a store card listing which energy drinks were spotted today">
      <div className={styles.phoneScreen}>
        {/* Map */}
        <svg viewBox="0 0 270 330" className={styles.phoneMap} aria-hidden="true">
          <rect width="270" height="330" fill="#0E110D" />
          {/* blocks */}
          <g fill="#141812">
            <rect x="12" y="20" width="88" height="70" rx="6" />
            <rect x="122" y="20" width="136" height="54" rx="6" />
            <rect x="122" y="128" width="60" height="78" rx="6" />
            <rect x="12" y="146" width="88" height="88" rx="6" />
            <rect x="200" y="128" width="58" height="74" rx="6" />
            <rect x="12" y="288" width="120" height="40" rx="6" />
            <rect x="150" y="268" width="108" height="60" rx="6" />
          </g>
          {/* park */}
          <rect x="122" y="214" width="60" height="44" rx="8" fill="#13200F" />
          {/* roads */}
          <g stroke="#232A20" strokeLinecap="round">
            <path d="M0 106 H270" strokeWidth="12" />
            <path d="M111 0 V330" strokeWidth="12" />
            <path d="M0 250 Q130 240 270 262" strokeWidth="9" />
            <path d="M191 106 V330" strokeWidth="7" />
          </g>
          <g stroke="#2E372A" strokeWidth="1" strokeDasharray="5 6">
            <path d="M0 106 H270" />
            <path d="M111 0 V330" />
          </g>
          {/* user location */}
          <circle cx="142" cy="170" r="16" fill="rgba(96,165,250,0.15)" />
          <circle cx="142" cy="170" r="10" fill="none" stroke="rgba(96,165,250,0.6)" strokeWidth="1.5" className={styles.youHalo} />
          <circle cx="142" cy="170" r="6" fill="#60a5fa" stroke="#0E110D" strokeWidth="2.5" />
        </svg>

        {/* Sighting pins */}
        {PINS.map((p, i) => (
          <span
            key={i}
            className={`${styles.pin} ${styles['sp_' + p.kind]} ${p.kind === 'fresh' && (p.n ?? 0) >= 5 ? styles.sp_busy : ''}`}
            style={{ left: px(p.x), top: py(p.y), ['--i' as string]: i } as React.CSSProperties}
          >
            {p.kind === 'fresh' ? <><EyeIcon size={11} color="#0D1210" />{p.n}</> : p.kind === 'out' ? '✕ Out' : p.label}
          </span>
        ))}

        {/* Search bar */}
        <div className={styles.phoneSearch}>
          <SearchIcon size={13} color="rgba(255,255,255,0.4)" />
          <span>Search stores or flavors</span>
        </div>

        {/* Store card */}
        <div className={styles.phoneCard}>
          <div className={styles.phoneCardHeader}>
            <div>
              <p className={styles.phoneStore}>Quick Stop #12</p>
              <p className={styles.phoneMeta}><span className={styles.freshDot} /> 8 sightings today · 0.4 mi</p>
            </div>
          </div>
          {STOCK.map((s, i) => (
            <div key={s.flavor} className={styles.phoneRow} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <div style={{ minWidth: 0 }}>
                <p className={styles.phoneBrand}>{s.brand}</p>
                <p className={styles.phoneFlavor}>{s.flavor}</p>
              </div>
              <span className={styles.phonePill} style={{ color: s.color, borderColor: `${s.color}55`, backgroundColor: `${s.color}14` }}>{s.level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
