const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#94a3b8']

export function LabelMix({ classes, note }: { classes: { label: string; count: number }[]; note?: string }) {
  const total = classes.reduce((sum, item) => sum + item.count, 0)
  const ring = 2 * Math.PI * 58
  let offset = 0
  return (
    <div>
      <div className="relative mx-auto h-40 w-40">
        <svg viewBox="0 0 160 160" role="img" aria-label="Share of sound labels" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r="58" fill="none" stroke="#1F2937" strokeWidth="14" />
          {total ? classes.map((item, index) => {
            const length = (item.count / total) * ring
            const dash = Math.max(0, length - 3)
            const slice = (
              <circle
                key={item.label}
                cx="80"
                cy="80"
                r="58"
                fill="none"
                stroke={COLORS[index % COLORS.length]}
                strokeWidth="14"
                strokeDasharray={`${dash} ${ring - dash}`}
                strokeDashoffset={-offset}
              />
            )
            offset += length
            return slice
          }) : null}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-mono text-xl text-slate-100">{total.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400">readings</div>
          </div>
        </div>
      </div>
      {note ? <p className="mt-3 text-sm leading-5 text-slate-400">{note}</p> : null}
      <ul className="mt-3 space-y-1 text-sm">
        {total === 0 ? <li className="text-slate-400">No labels yet</li> : null}
        {classes.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            <i className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <b className="font-mono text-xs text-slate-300">{Math.round((item.count / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
