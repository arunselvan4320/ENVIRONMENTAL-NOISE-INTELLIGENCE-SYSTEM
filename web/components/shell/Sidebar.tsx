'use client'

import { AudioLines, Cpu, LayoutDashboard, PanelLeft, Settings, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SectionId } from '@/types/iot'

const NAV: { id: SectionId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'fleet', label: 'Device Fleet', icon: Cpu },
  { id: 'stream', label: 'Live Stream', icon: AudioLines },
  { id: 'rules', label: 'Rules', icon: ShieldAlert },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({
  section,
  collapsed,
  mobileOpen,
  alertCount,
  onSelect,
  onToggle,
  onCloseMobile,
}: {
  section: SectionId
  collapsed: boolean
  mobileOpen: boolean
  alertCount: number
  onSelect: (section: SectionId) => void
  onToggle: () => void
  onCloseMobile: () => void
}) {
  return (
    <>
      {mobileOpen ? <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onCloseMobile} /> : null}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-[#0c1019] transition-[width,transform] md:static',
        collapsed ? 'w-16' : 'w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-line text-emerald-400">
            <AudioLines className="h-4 w-4" aria-hidden="true" />
          </span>
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Kaanam <span lang="ta" className="text-slate-400">கானம்</span></div>
              <div className="truncate font-mono text-[10px] text-slate-500">noise/console</div>
            </div>
          )}
        </div>
        <nav aria-label="Pages" className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                title={item.label}
                onClick={() => { onSelect(item.id); onCloseMobile() }}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200',
                  active ? 'bg-white/5 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {collapsed ? null : <span className="truncate">{item.label}</span>}
                {item.id === 'rules' && !collapsed ? (
                  <span className="ml-auto font-mono text-[11px] text-amber-400">{alertCount}</span>
                ) : null}
              </button>
            )
          })}
        </nav>
        <button type="button" onClick={onToggle} className="m-2 hidden items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400 hover:bg-white/5 md:inline-flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <PanelLeft className="h-4 w-4" />
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </aside>
    </>
  )
}
