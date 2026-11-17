'use client'

import * as ScrollArea from '@radix-ui/react-scroll-area'
import { ChevronDown, Radio } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatUtc } from '@/lib/utils'
import type { PacketLogEntry } from '@/types/iot'

export function MqttConsole({
  open,
  onToggle,
  packets,
  isConnected,
}: {
  open: boolean
  onToggle: () => void
  packets: PacketLogEntry[]
  isConnected: boolean
}) {
  const [topicFilter, setTopicFilter] = useState('')
  const visible = useMemo(() => {
    const query = topicFilter.trim().toLowerCase()
    if (!query) return packets
    return packets.filter((packet) => packet.topic.toLowerCase().includes(query))
  }, [packets, topicFilter])

  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[#0c1220]">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200"
        >
          <Radio className={isConnected ? 'h-4 w-4 text-emerald-500 live-dot rounded-full' : 'h-4 w-4 text-rose-500'} />
          Live payload console
          <ChevronDown className={open ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
        </button>
        <span className="font-mono text-[11px] text-slate-400">{packets.length} packets</span>
        <label className="ml-auto text-xs text-slate-400">
          Topic
          <input
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
            placeholder="noise/"
            spellCheck={false}
            className="ml-2 h-7 w-40 rounded border border-line bg-obsidian px-2 font-mono text-[11px] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200 md:w-64"
          />
        </label>
      </div>
      {open ? (
        <ScrollArea.Root className="h-52 border-t border-line">
          <ScrollArea.Viewport className="h-full w-full">
            <ol className="divide-y divide-line">
              {visible.length === 0 ? <li className="px-3 py-4 text-sm text-slate-400">No packets for that topic yet.</li> : null}
              {visible.map((packet) => (
                <li key={packet.id} className="grid gap-1 px-3 py-2 md:grid-cols-[9rem_14rem_1fr]">
                  <time className="font-mono text-[11px] text-slate-400">{formatUtc(packet.receivedAt)} UTC</time>
                  <span className="truncate font-mono text-[11px] text-emerald-400">{packet.topic}</span>
                  <code className="truncate font-mono text-[11px] text-slate-300">{JSON.stringify(packet.body)}</code>
                </li>
              ))}
            </ol>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none bg-transparent p-0.5">
            <ScrollArea.Thumb className="relative flex-1 rounded bg-slate-600" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      ) : null}
    </aside>
  )
}
