'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Hold the newest value and publish it on a timer, so a fast sensor stream does not re-render every packet. */
export function useThrottledState<T>(initial: T, waitMs: number) {
  const [value, setValue] = useState(initial)
  const latest = useRef(initial)
  const timer = useRef<number | null>(null)

  const setThrottled = useCallback((next: T) => {
    latest.current = next
    if (timer.current != null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      setValue(latest.current)
    }, waitMs)
  }, [waitMs])

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current)
  }, [])

  return [value, setThrottled] as const
}
