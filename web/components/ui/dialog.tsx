'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-widget p-5 text-slate-100 shadow-2xl focus:outline-none">
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded p-1 text-slate-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200" aria-label="Close">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          <DialogPrimitive.Title className="pr-8 text-lg font-medium">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-slate-300">{description}</DialogPrimitive.Description> : null}
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
