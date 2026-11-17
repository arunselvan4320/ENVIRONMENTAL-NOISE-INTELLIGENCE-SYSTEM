'use client'

import { useCallback, useRef } from 'react'
import { useThrottledState } from '@/hooks/useThrottledState'
import type { PacketLogEntry } from '@/types/iot'

const LIMIT = 200

export function usePacketLog() {
  const buffer = useRef<PacketLogEntry[]>([])
  const [packets, setPackets] = useThrottledState<PacketLogEntry[]>([], 250)

  const push = useCallback((topic: string, body: unknown) => {
    const entry: PacketLogEntry = {
      id: crypto.randomUUID(),
      topic,
      receivedAt: new Date().toISOString(),
      body,
    }
    buffer.current = [entry, ...buffer.current].slice(0, LIMIT)
    setPackets(buffer.current.slice())
  }, [setPackets])

  return { packets, push }
}
