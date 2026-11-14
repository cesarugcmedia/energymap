import { ConvenienceIcon, GasIcon, GroceryIcon, SearchIcon } from '@/components/Icons'
import styles from './landing.module.css'

// Static illustration of the map screen for the landing page — drawn with the
// app's real palette, pin styles and freshness colors rather than a screenshot,
// so it stays sharp at any size and needs no image asset. The store and stock
// shown are illustrative, not live data.

const LIME = '#C9F400'
const AMBER = '#FFB300'
const GRAY = '#6B7468'

// Pin/cluster coordinates are in the map SVG's 270×330 space; the map fills
// the top MAP_H of the screen, so convert to screen percentages with these.
const MAP_H = 0.58
const px = (x: number) => `${(x / 270) * 100}%`
const py = (y: number) => `${(y / 330) * MAP_H * 100}%`

const PINS: { x: number; y: number; color: string; Icon: typeof GasIcon }[] = [
  { x: 52, y: 118, color: LIME, Icon: GasIcon },
  { x: 196, y: 96, color: GRAY, Icon: ConvenienceIcon },
  { x: 214, y: 236, color: AMBER, Icon: GroceryIcon },
  { x: 70, y: 262, color: LIME, Icon: ConvenienceIcon },
]

const STOCK = [
  { brand: 'Celsius', flavor: 'Sparkling Kiwi Guava', level: 'FULL', color: LIME },
  { brand: 'Ghost', flavor: 'Sour Patch Kids Blue Raspberry', level: 'LOW', color: AMBER },
  { brand: 'Alani Nu', flavor: 'Cherry Slush', level: 'FULL', color: LIME },
]

export default function PhoneMockup() {
  return (
    <div className={styles.phone} role="img" aria-label="AmpedMap on a phone: a map of nearby stores with color-coded pins, and a store card listing which energy drinks are in stock">
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
          <circle cx="142" cy="170" r="6" fill="#60a5fa" stroke="#0E110D" strokeWidth="2.5" />
        </svg>

        {/* Pins (HTML so they can use the shared line icons) */}
        {PINS.map((p, i) => (
          <span
            key={i}
            className={styles.pin}
            style={{ left: px(p.x), top: py(p.y), borderColor: p.color, boxShadow: `0 0 12px ${p.color}55` }}
          >
            <p.Icon size={13} color={p.color} />
          </span>
        ))}
        <span className={styles.cluster} style={{ left: px(150), top: py(84) }}>4</span>

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
              <p className={styles.phoneMeta}><span className={styles.freshDot} /> Updated 18 min ago · 0.4 mi</p>
            </div>
          </div>
          {STOCK.map((s) => (
            <div key={s.flavor} className={styles.phoneRow}>
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
