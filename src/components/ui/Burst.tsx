// A ring of dots that flies outward once — for saves, likes and successes.
// Place inside a position:relative element; re-key `trigger` to replay
// (renders nothing while it's 0, so it never plays on page load).
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

export default function Burst({ trigger, size = 'small', colors = ['#C9F400', '#FFB300', '#C9F400', '#60a5fa'] }: {
  trigger: number
  size?: 'small' | 'large'
  colors?: string[]
}) {
  if (!trigger) return null
  const vars = size === 'small'
    ? { '--burst-dot': '5px', '--burst-from': '-10px', '--burst-to': '-24px' }
    : { '--burst-dot': '8px', '--burst-from': '-30px', '--burst-to': '-70px' }
  return (
    <span key={trigger} className="burst" aria-hidden="true" style={vars as React.CSSProperties}>
      {ANGLES.map((a, i) => (
        <span key={a} style={{ ['--a' as string]: `${a}deg`, background: colors[i % colors.length] } as React.CSSProperties} />
      ))}
    </span>
  )
}
