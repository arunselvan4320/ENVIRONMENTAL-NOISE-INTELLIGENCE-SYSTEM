import { formatUtc } from '@/lib/utils'

export function LevelChart({
  series,
  threshold,
}: {
  series: { timestamp: string; index: number }[]
  threshold: number
}) {
  if (!series.length) return <p className="text-sm text-slate-400">No readings in this time range.</p>
  const width = 780
  const height = 240
  const left = 46
  const right = 12
  const top = 16
  const bottom = 28
  const x = (index: number) => left + (index / Math.max(1, series.length - 1)) * (width - left - right)
  const y = (value: number) => height - bottom - value * (height - top - bottom)
  const coords = series.map((item, index) => `${x(index).toFixed(1)},${y(item.index).toFixed(1)}`)
  const points = coords.join(' ')
  const area = `${left},${(height - bottom).toFixed(1)} ${points} ${x(series.length - 1).toFixed(1)},${(height - bottom).toFixed(1)}`
  const last = series[series.length - 1]
  const lastX = x(series.length - 1)
  const lastY = y(last.index)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Unitless index over time, from 0 to 1" className="h-auto w-full">
      <defs>
        <linearGradient id="level-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((value) => (
        <g key={value}>
          <line x1={left} y1={y(value)} x2={width - right} y2={y(value)} stroke="#1F2937" />
          <text x={left - 8} y={y(value) + 3} fill="#9CA3AF" fontSize="11" textAnchor="end" fontFamily="var(--font-mono)">{value.toFixed(2)}</text>
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((step) => {
        const index = Math.round((step / 4) * (series.length - 1))
        return <text key={step} x={x(index)} y={height - 8} fill="#9CA3AF" fontSize="11" textAnchor="middle" fontFamily="var(--font-mono)">{formatUtc(series[index].timestamp).slice(0, 5)}</text>
      })}
      <line className="threshold-line" x1={left} y1={y(threshold)} x2={width - right} y2={y(threshold)} stroke="#f43f5e" />
      <polygon className="level-fill" points={area} fill="url(#level-fill)" />
      <polyline className="level-line" pathLength={1} points={points} fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle className="level-ping" cx={lastX} cy={lastY} r="5" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="4" fill="#f59e0b" />
    </svg>
  )
}
