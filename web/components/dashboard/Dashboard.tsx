'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { KpiBar } from '@/components/shell/KpiBar'
import { Sidebar } from '@/components/shell/Sidebar'
import { MqttConsole } from '@/components/telemetry/MqttConsole'
import { TelemetryWidget } from '@/components/telemetry/TelemetryWidget'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { DeviceFleet } from '@/components/widgets/DeviceFleet'
import { ForecastPanel } from '@/components/widgets/ForecastPanel'
import { LabelMix } from '@/components/widgets/LabelMix'
import { LevelChart } from '@/components/widgets/LevelChart'
import { ReadingsTable } from '@/components/widgets/ReadingsTable'
import { RulesPanel } from '@/components/widgets/RulesPanel'
import { SettingsPanel } from '@/components/widgets/SettingsPanel'
import { SiteSketch } from '@/components/widgets/SiteSketch'
import { SoundLab } from '@/components/widgets/SoundLab'
import { useTelemetry } from '@/hooks/useTelemetry'
import { ApiError, api } from '@/lib/api'
import { formatIndex } from '@/lib/utils'
import type { ConsoleFilters, SectionId, TelemetryPayload } from '@/types/iot'

function envelope<T>(topic: string, body: T, receivedAt: string | null): TelemetryPayload<T> | null {
  if (!receivedAt) return null
  return { topic, receivedAt, body }
}

export function Dashboard() {
  const [section, setSection] = useState<SectionId>('overview')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [filters, setFilters] = useState<ConsoleFilters>({ source: 'demo', deviceId: 'all', hours: 6 })
  const [admin, setAdmin] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null)
  const lastProblem = useRef('')
  const adminRef = useRef('')
  adminRef.current = admin

  function report(message: string, error = false) {
    if (error && message === lastProblem.current) return
    lastProblem.current = error ? message : ''
    setToast({ text: message, error })
    window.setTimeout(() => setToast((current) => (current?.text === message ? null : current)), 4000)
  }

  const telemetry = useTelemetry(filters, admin, () => {
    if (adminRef.current) {
      setAdmin('')
      setAuthOpen(true)
    }
  })

  const openAlerts = telemetry.alerts.filter((item) => !item.acknowledged).length
  const linkStatus = telemetry.isConnected ? (filters.source === 'demo' ? 'warning' : 'online') : 'offline'
  const received = telemetry.lastUpdated
  const topicBase = `noise/${filters.source}/${filters.deviceId}`

  const metricPayload = useMemo(() => envelope(`${topicBase}/overview`, telemetry.overview, received), [topicBase, telemetry.overview, received])

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = new FormData(event.currentTarget).get('token')
    const candidate = String(input ?? '').trim()
    const previous = admin
    try {
      await api('/api/admin/check', candidate, { method: 'POST' })
      setAdmin(candidate)
      setAuthOpen(false)
      report('Admin tools unlocked')
    } catch (err) {
      setAdmin(previous)
      report(err instanceof Error ? err.message : 'Admin token was rejected.', true)
    }
  }

  async function tick() {
    if (!admin) {
      setAuthOpen(true)
      return
    }
    try {
      await api('/api/demo/tick', admin, { method: 'POST' })
      report('Added a practice reading')
      telemetry.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAdmin('')
        setAuthOpen(true)
      }
      report(err instanceof Error ? err.message : 'Could not add a practice reading.', true)
    }
  }

  return (
    <div className="min-h-screen bg-obsidian text-slate-100">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-slate-950">Skip to content</a>
      <div className="flex min-h-screen">
        <Sidebar
          section={section}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          alertCount={openAlerts}
          onSelect={setSection}
          onToggle={() => setCollapsed((value) => !value)}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className={`flex min-w-0 flex-1 flex-col ${consoleOpen ? 'pb-64' : 'pb-12'}`}>
          <KpiBar
            isConnected={telemetry.isConnected}
            lastUpdated={telemetry.lastUpdated}
            overview={telemetry.overview}
            devices={telemetry.devices}
            filters={filters}
            openAlerts={openAlerts}
            onMenu={() => setMobileOpen(true)}
            onFilters={(next) => setFilters((current) => ({ ...current, ...next }))}
          />
          <main id="main-content" className="flex-1 p-3 md:p-5">
            {telemetry.error ? <p role="status" className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{telemetry.error}</p> : null}
            {section === 'overview' ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
                <Metric title="Current level" topic={`${topicBase}/current`} value={formatIndex(telemetry.overview?.current)} detail="Latest minute · not decibels" payload={metricPayload} connected={telemetry.isConnected} updated={received} status={linkStatus} className="xl:col-span-3" />
                <Metric title="Average" topic={`${topicBase}/mean`} value={formatIndex(telemetry.overview?.mean)} detail="Valid readings only" payload={metricPayload} connected={telemetry.isConnected} updated={received} status={linkStatus} className="xl:col-span-3" />
                <Metric title="Highest" topic={`${topicBase}/peak`} value={formatIndex(telemetry.overview?.peak)} detail="Highest valid reading" payload={metricPayload} connected={telemetry.isConnected} updated={received} status={linkStatus} className="xl:col-span-3" />
                <Metric title="Readings over the line" topic={`${topicBase}/exceedances`} value={String(telemetry.overview?.exceedances ?? '—')} detail={`${telemetry.overview?.valid ?? 0} valid readings · line at ${formatIndex(telemetry.overview?.threshold, 2)} · open alerts are counted above`} payload={metricPayload} connected={telemetry.isConnected} updated={received} status={openAlerts ? 'warning' : linkStatus} className="xl:col-span-3" />
                <TelemetryWidget title="Unitless index over time" topic={`${topicBase}/series`} payload={metricPayload} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus} className="xl:col-span-8">
                  <LevelChart series={telemetry.overview?.series ?? []} threshold={telemetry.overview?.threshold ?? 0.72} />
                  <p className="mt-2 font-mono text-[11px] text-slate-500">{telemetry.overview?.valid ?? 0} valid · {telemetry.overview?.flagged ?? 0} flagged · times in UTC</p>
                </TelemetryWidget>
                <TelemetryWidget title="What the labels say" topic={`${topicBase}/classes`} payload={envelope(`${topicBase}/classes`, telemetry.overview?.classes ?? [], received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus} className="xl:col-span-4">
                  <LabelMix classes={telemetry.overview?.classes ?? []} note={filters.source === 'demo' ? 'Practice seed. These names are not from the sound model.' : undefined} />
                </TelemetryWidget>
                <TelemetryWidget title="Sensor sketch" topic="noise/devices" payload={envelope('noise/devices', telemetry.devices, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus} className="xl:col-span-5">
                  <SiteSketch devices={telemetry.devices.filter((device) => Boolean(device.demo) === (filters.source === 'demo'))} onPick={(id) => setFilters((current) => ({ ...current, deviceId: id }))} />
                </TelemetryWidget>
                <TelemetryWidget title="How to read this" topic="noise/meta/measurement" payload={envelope('noise/meta/measurement', { scale: '0 to 1', unit: 'not decibels' }, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus} className="xl:col-span-7">
                  <p className="text-sm leading-6 text-slate-300">This number comes from signal energy on a 0 to 1 scale. It is not a legal limit or a health measurement. The forecast is compared with “same as last time”, a short average, and a straight line. The closest one is shown.</p>
                  {filters.source === 'demo' ? <Button className="mt-3" onClick={() => void tick()}>Add a practice reading</Button> : null}
                </TelemetryWidget>
                <TelemetryWidget title="Short projection" topic={filters.deviceId === 'all' ? 'noise/forecast' : `noise/forecast/${filters.deviceId}`} payload={envelope('noise/forecast', telemetry.forecast, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus} className="xl:col-span-12">
                  <ForecastPanel forecast={telemetry.forecast} />
                </TelemetryWidget>
                <TelemetryWidget title="Latest readings" topic={`${topicBase}/recent`} payload={envelope(`${topicBase}/recent`, telemetry.overview?.recent ?? [], received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus} className="xl:col-span-12">
                  <ReadingsTable rows={telemetry.overview?.recent ?? []} source={filters.source} />
                </TelemetryWidget>
              </div>
            ) : null}
            {section === 'fleet' ? (
              <TelemetryWidget title="Device fleet" topic="noise/devices" payload={envelope('noise/devices', telemetry.devices, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus}>
                <DeviceFleet devices={telemetry.devices} source={filters.source} adminToken={admin} onNeedAdmin={() => setAuthOpen(true)} onCreated={() => telemetry.refresh()} onError={(message) => report(message, true)} />
              </TelemetryWidget>
            ) : null}
            {section === 'stream' ? (
              <div className="grid gap-3">
                <TelemetryWidget title="Live sound" topic="noise/audio/analyse" payload={envelope('noise/audio/analyse', telemetry.ai, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={telemetry.ai?.ready ? 'online' : 'warning'}>
                  <SoundLab adminToken={admin} ai={telemetry.ai} onPacket={telemetry.pushPacket} onError={(message) => report(message, true)} onDone={(message) => report(message)} />
                </TelemetryWidget>
                <TelemetryWidget title="Incoming readings" topic={`${topicBase}/recent`} payload={envelope(`${topicBase}/recent`, telemetry.overview?.recent ?? [], received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus}>
                  <ReadingsTable rows={telemetry.overview?.recent ?? []} source={filters.source} />
                </TelemetryWidget>
              </div>
            ) : null}
            {section === 'rules' ? (
              <TelemetryWidget title="Alert rules" topic={`${topicBase}/alerts`} payload={envelope(`${topicBase}/alerts`, telemetry.alerts, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={openAlerts ? 'warning' : linkStatus}>
                <RulesPanel alerts={telemetry.alerts} threshold={telemetry.overview?.threshold ?? 0.72} source={filters.source} adminToken={admin} onNeedAdmin={() => setAuthOpen(true)} onChanged={() => telemetry.refresh()} onError={(message) => report(message, true)} onMessage={(message) => report(message)} />
              </TelemetryWidget>
            ) : null}
            {section === 'settings' ? (
              <TelemetryWidget title="Console settings" topic="noise/health" payload={envelope('noise/health', telemetry.health, received)} isConnected={telemetry.isConnected} lastUpdated={received} status={linkStatus}>
                <SettingsPanel filters={filters} adminOn={Boolean(admin)} health={telemetry.health} onFilters={(next) => setFilters((current) => ({ ...current, ...next }))} onAdmin={() => setAuthOpen(true)} onTick={() => void tick()} />
              </TelemetryWidget>
            ) : null}
          </main>
        </div>
      </div>
      <MqttConsole open={consoleOpen} onToggle={() => setConsoleOpen((value) => !value)} packets={telemetry.packets} isConnected={telemetry.isConnected} />
      <Modal
        open={authOpen}
        onOpenChange={setAuthOpen}
        title="Admin access"
        description="Paste the token from data/admin-token.txt on the server, or the KAANAM_ADMIN_TOKEN you set. It stays in this browser tab only."
      >
        <form onSubmit={(event) => void unlock(event)} className="grid gap-3">
          <input name="token" type="password" required autoComplete="off" placeholder="Admin token" className="h-9 rounded border border-line bg-obsidian px-2 font-mono text-sm" />
          <Button type="submit">Unlock admin tools</Button>
        </form>
      </Modal>
      {toast ? (
        <div role="status" className={`fixed bottom-16 right-3 z-50 max-w-sm rounded border px-3 py-2 text-sm ${toast.error ? 'border-rose-500/50 bg-rose-950 text-rose-100' : 'border-line bg-widget text-slate-100'}`}>
          {toast.text}
        </div>
      ) : null}
    </div>
  )
}

function Metric({
  title,
  topic,
  value,
  detail,
  payload,
  connected,
  updated,
  status,
  className,
}: {
  title: string
  topic: string
  value: string
  detail: string
  payload: TelemetryPayload | null
  connected: boolean
  updated: string | null
  status: 'online' | 'warning' | 'offline'
  className?: string
}) {
  return (
    <TelemetryWidget title={title} topic={topic} payload={payload} isConnected={connected} lastUpdated={updated} status={status} className={className}>
      <div className="font-mono text-3xl text-slate-50">{value}</div>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </TelemetryWidget>
  )
}
