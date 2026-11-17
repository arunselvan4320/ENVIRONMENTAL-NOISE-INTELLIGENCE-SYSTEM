'use client'

import { Button } from '@/components/ui/button'
import type { ConsoleFilters, HealthSnapshot } from '@/types/iot'

export function SettingsPanel({
  filters,
  adminOn,
  health,
  onFilters,
  onAdmin,
  onTick,
}: {
  filters: ConsoleFilters
  adminOn: boolean
  health: HealthSnapshot | null
  onFilters: (next: Partial<ConsoleFilters>) => void
  onAdmin: () => void
  onTick: () => void
}) {
  const query = new URLSearchParams({
    source: filters.source,
    device_id: filters.deviceId,
    hours: String(filters.hours),
  })
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 text-sm leading-6 text-slate-300">
        <p>Practice data is example readings so you can explore. Live sensors are readings from registered devices. The number is a unitless index, not decibels.</p>
        <p className="font-mono text-xs text-slate-400">refresh 10s · source {filters.source} · device {filters.deviceId} · window {filters.hours}h</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onFilters({ source: filters.source === 'demo' ? 'live' : 'demo', deviceId: 'all' })}>
            {filters.source === 'demo' ? 'Switch to live sensors' : 'Switch to practice data'}
          </Button>
          <Button variant="secondary" onClick={onAdmin}>{adminOn ? 'Admin tools on' : 'Admin access'}</Button>
          {filters.source === 'demo' ? <Button onClick={onTick}>Add a practice reading</Button> : null}
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <a className="block font-mono text-xs text-emerald-400 underline-offset-2 hover:underline" href={`/api/export.csv?${query}`}>Download kaanam-observations.csv</a>
        <a className="block text-slate-300 underline-offset-2 hover:underline" href="/docs" target="_blank" rel="noreferrer">API documentation</a>
        <p className="font-mono text-[11px] text-slate-500">{health?.measurement ?? 'unitless RMS-derived index; not dB or LAeq'}</p>
        <p className="text-slate-400">Audio you upload is analysed in memory and then discarded. It is not sent to another service.</p>
      </div>
    </div>
  )
}
