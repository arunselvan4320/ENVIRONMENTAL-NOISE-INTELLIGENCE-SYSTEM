'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { usePacketLog } from '@/hooks/usePacketLog'
import type {
  AiStatus,
  AlertRecord,
  ConsoleFilters,
  DeviceRecord,
  ForecastSnapshot,
  HealthSnapshot,
  OverviewSnapshot,
} from '@/types/iot'

const EMPTY_FORECAST: ForecastSnapshot = {
  available: false,
  note: 'Choose one sensor. A forecast is for a single place.',
}

export interface TelemetryState {
  devices: DeviceRecord[]
  overview: OverviewSnapshot | null
  alerts: AlertRecord[]
  forecast: ForecastSnapshot
  health: HealthSnapshot | null
  ai: AiStatus | null
  isConnected: boolean
  lastUpdated: string | null
  error: string | null
  packets: ReturnType<typeof usePacketLog>['packets']
  refresh: () => void
  pushPacket: (topic: string, body: unknown) => void
}

export function useTelemetry(filters: ConsoleFilters, adminToken: string, onUnauthorized: () => void): TelemetryState {
  const { packets, push } = usePacketLog()
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [overview, setOverview] = useState<OverviewSnapshot | null>(null)
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [forecast, setForecast] = useState<ForecastSnapshot>(EMPTY_FORECAST)
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [isConnected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filtersRef = useRef(filters)
  const adminRef = useRef(adminToken)
  const busy = useRef(false)
  const again = useRef(false)
  const unauth = useRef(onUnauthorized)
  filtersRef.current = filters
  adminRef.current = adminToken
  unauth.current = onUnauthorized

  const pull = useCallback(async () => {
    if (busy.current) {
      again.current = true
      return
    }
    busy.current = true
    const snapshot = `${filters.source}|${filters.deviceId}|${filters.hours}`
    const current = () => {
      const live = filtersRef.current
      return `${live.source}|${live.deviceId}|${live.hours}`
    }
    try {
      const query = new URLSearchParams({
        source: filters.source,
        device_id: filters.deviceId,
        hours: String(filters.hours),
      })
      const token = adminRef.current
      const [healthBody, deviceBody, overviewBody, alertBody, aiBody] = await Promise.all([
        api<HealthSnapshot>('/api/health', token),
        api<DeviceRecord[]>('/api/devices', token),
        api<OverviewSnapshot>(`/api/overview?${query}`, token),
        api<AlertRecord[]>(`/api/alerts?${query}`, token),
        api<AiStatus>('/api/ai/status', token),
      ])
      if (current() !== snapshot) return
      let forecastBody = EMPTY_FORECAST
      if (filters.deviceId !== 'all') {
        forecastBody = await api<ForecastSnapshot>(`/api/forecast?source=${filters.source}&device_id=${filters.deviceId}`, token)
        if (current() !== snapshot) return
      }
      const receivedAt = new Date().toISOString()
      push('noise/health', healthBody)
      push('noise/devices', deviceBody)
      push('noise/overview', overviewBody)
      push('noise/alerts', alertBody)
      push('noise/ai/status', aiBody)
      if (filters.deviceId !== 'all') push(`noise/forecast/${filters.deviceId}`, forecastBody)
      setHealth(healthBody)
      setDevices(deviceBody)
      setOverview(overviewBody)
      setAlerts(alertBody)
      setAi(aiBody)
      setForecast(forecastBody)
      setConnected(true)
      setLastUpdated(receivedAt)
      setError(null)
    } catch (err) {
      if (current() !== snapshot) return
      const message = err instanceof Error ? err.message : 'Cannot reach the Kaanam server. Is it running?'
      if (err instanceof ApiError && err.status === 401) unauth.current()
      setConnected(false)
      setError(message)
      push('noise/error', { message })
    } finally {
      busy.current = false
      if (again.current) {
        again.current = false
        void pull()
      }
    }
  }, [filters.deviceId, filters.hours, filters.source, push])

  useEffect(() => {
    void pull()
    const timer = window.setInterval(() => void pull(), 10000)
    return () => window.clearInterval(timer)
  }, [pull])

  return {
    devices,
    overview,
    alerts,
    forecast,
    health,
    ai,
    isConnected,
    lastUpdated,
    error,
    packets,
    refresh: pull,
    pushPacket: push,
  }
}
