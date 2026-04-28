export const BRAND_COLORS: Record<string, string> = {
  Monster:    '#00cc44',
  'Red Bull': '#e63946',
  Celsius:    '#7c3aed',
  Ghost:      '#06b6d4',
  Reign:      '#f97316',
  Rockstar:   '#facc15',
  Bang:       '#ec4899',
  NOS:        '#3b82f6',
  'Alani Nu': '#f472b6',
}

export default function BrandLogo({ brand, size = 32 }: { brand: string; size?: number }) {
  const color = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'
  const letter = brand.charAt(0).toUpperCase()

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: `${color}20`,
        border: `1.5px solid ${color}55`,
        boxShadow: `0 0 10px ${color}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ color, fontSize: size * 0.42, fontWeight: 900, lineHeight: 1 }}>
        {letter}
      </span>
    </div>
  )
}
