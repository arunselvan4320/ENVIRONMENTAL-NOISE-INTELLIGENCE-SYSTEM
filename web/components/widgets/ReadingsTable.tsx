import { FLAG_NAMES, formatIndex, formatUtc } from '@/lib/utils'
import type { ObservationRecord, SourceMode } from '@/types/iot'

export function ReadingsTable({ rows, source }: { rows: ObservationRecord[]; source: SourceMode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="pb-2 pr-3 font-medium">Sensor</th>
            <th className="pb-2 pr-3 font-medium">Time (UTC)</th>
            <th className="pb-2 pr-3 font-medium">Level</th>
            <th className="pb-2 pr-3 font-medium">Label</th>
            <th className="pb-2 font-medium">Quality</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="py-6 text-slate-400">No readings for this filter.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              <td className="py-2 pr-3">{row.device_name}</td>
              <td className="py-2 pr-3 font-mono text-xs">{formatUtc(row.timestamp)}</td>
              <td className="py-2 pr-3 font-mono text-xs">{formatIndex(row.level)}</td>
              <td className="py-2 pr-3">{row.label}</td>
              <td className="py-2 text-slate-300">
                {row.flags.length ? row.flags.map((flag) => FLAG_NAMES[flag] ?? flag).join(', ') : source === 'demo' ? 'Practice' : 'OK'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
