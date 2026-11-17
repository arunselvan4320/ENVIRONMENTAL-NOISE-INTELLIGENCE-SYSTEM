'use client'

import { cn } from '@/lib/utils'
import type { DeviceRecord } from '@/types/iot'

const POSITIONS = [[34, 48], [16, 24], [72, 65]]

export function SiteSketch({
  devices,
  onPick,
}: {
  devices: DeviceRecord[]
  onPick: (id: string) => void
}) {
  return (
    <div>
      <div className="relative h-52 overflow-hidden rounded border border-line bg-obsidian">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-line" />
        <div className="absolute bottom-0 left-1/3 top-0 w-px bg-line" />
        <span className="absolute left-3 top-3 font-mono text-[10px] text-slate-500">PATH</span>
        <span className="absolute bottom-2 right-2 font-mono text-[10px] text-slate-500">Not a real map</span>
        {devices.slice(0, 3).map((device, index) => {
          const [left, top] = POSITIONS[index]
          const rightSide = left > 55
          return (
            <button
              key={device.id}
              type="button"
              onClick={() => onPick(device.id)}
              aria-label={`Show ${device.name}`}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <span className={cn('absolute top-4 whitespace-nowrap font-mono text-[10px] text-slate-200', rightSide ? 'right-0' : 'left-0')}>{device.name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 font-mono text-[11px] text-slate-400">{devices.length} sensors in this view</p>
    </div>
  )
}
