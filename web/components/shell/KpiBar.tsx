'use client'

import { Menu } from 'lucide-react'
import { formatIndex, formatUtc } from '@/lib/utils'
import type { ConsoleFilters, DeviceRecord, OverviewSnapshot } from '@/types/iot'

export function KpiBar({
  isConnected,
  lastUpdated,
  overview,
  devices,
  filters,
  openAlerts,
  onMenu,
  onFilters,
}: {
  isConnected: boolean
  lastUpdated: string | null
  overview: OverviewSnapshot | null
  devices: DeviceRecord[]
  filters: ConsoleFilters
  openAlerts: number
  onMenu: () => void
  onFilters: (next: Partial<ConsoleFilters>) => void
}) {
  const visible = devices.filter((device) => Boolean(device.demo) === (filters.source === 'demo'))
  const reporting = visible.filter((device) => device.status === 'online').length
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-obsidian/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 md:px-4">
        <button type="button" className="rounded p-1 text-slate-200 md:hidden" aria-label="Open navigation" onClick={onMenu}>
          <Menu className="h-5 w-5" />
        </button>
        <Kpi label="Link" value={isConnected ? 'UP' : 'DOWN'} tone={isConnected ? 'text-emerald-400' : 'text-rose-400'} live={isConnected} />
        <Kpi label="Updated" value={lastUpdated ? `${formatUtc(lastUpdated)} UTC` : '—'} />
        <Kpi label="Index" value={formatIndex(overview?.current)} />
        <Kpi label="Alerts" value={String(openAlerts)} tone={openAlerts ? 'text-amber-400' : 'text-slate-100'} />
        <Kpi label="Reporting" value={filters.source === 'demo' ? `${visible.length} practice` : `${reporting}/${visible.length}`} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Which readings to show" value={filters.source} onChange={(event) => onFilters({ source: event.target.value === 'live' ? 'live' : 'demo', deviceId: 'all' })} className="h-8 rounded border border-line bg-widget px-2 text-xs text-slate-100">
            <option value="demo">Practice data</option>
            <option value="live">Live sensors</option>
          </select>
          <select aria-label="Sensor" value={filters.deviceId} onChange={(event) => onFilters({ deviceId: event.target.value })} className="h-8 max-w-[10rem] rounded border border-line bg-widget px-2 font-mono text-xs text-slate-100">
            <option value="all">all</option>
            {visible.map((device) => <option key={device.id} value={device.id}>{device.id}</option>)}
          </select>
          <select aria-label="Time range" value={filters.hours} onChange={(event) => onFilters({ hours: Number(event.target.value) })} className="h-8 rounded border border-line bg-widget px-2 font-mono text-xs text-slate-100">
            <option value={1}>1h</option>
            <option value={6}>6h</option>
            <option value={24}>24h</option>
            <option value={168}>7d</option>
          </select>
        </div>
      </div>
    </header>
  )
}

function Kpi({ label, value, tone = 'text-slate-100', live = false }: { label: string; value: string; tone?: string; live?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`flex items-center gap-1.5 truncate font-mono text-sm ${tone}`}>
        {live ? <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" /> : null}
        {value}
      </div>
    </div>
  )
}
