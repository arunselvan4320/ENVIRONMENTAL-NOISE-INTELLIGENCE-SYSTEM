'use client'

import { Braces } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn, formatUtc } from '@/lib/utils'
import type { LinkState, TelemetryPayload } from '@/types/iot'

const DOT: Record<LinkState, string> = {
  online: 'bg-emerald-500',
  warning: 'bg-amber-500',
  offline: 'bg-rose-500',
}

export function TelemetryWidget({
  title,
  topic,
  payload,
  isConnected,
  lastUpdated,
  refreshMs = 10000,
  status,
  className,
  children,
}: {
  title: string
  topic: string
  payload: TelemetryPayload | null
  isConnected: boolean
  lastUpdated: string | null
  refreshMs?: number
  status?: LinkState
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const link: LinkState = status ?? (isConnected ? 'online' : 'offline')
  return (
    <section className={cn('flex min-w-0 flex-col rounded-lg border border-line bg-widget', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[link])} aria-hidden="true" />
            <h2 className="truncate text-sm font-medium text-slate-100">{title}</h2>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{topic}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge>{Math.round(refreshMs / 1000)}s</Badge>
          <button
            type="button"
            aria-pressed={open}
            aria-label={open ? 'Hide raw JSON' : 'Show raw JSON'}
            onClick={() => setOpen((value) => !value)}
            className={cn('rounded border border-line p-1.5 text-slate-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200', open && 'text-emerald-400')}
          >
            <Braces className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
      {open ? (
        <div className="border-t border-line bg-obsidian/80 p-3">
          <p className="font-mono text-[11px] text-slate-400">endpoint {topic}</p>
          <p className="font-mono text-[11px] text-slate-500">updated {formatUtc(lastUpdated)} UTC</p>
          <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] leading-5 text-emerald-300/90">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  )
}
