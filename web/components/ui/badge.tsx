import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-slate-300', className)}>
      {children}
    </span>
  )
}
