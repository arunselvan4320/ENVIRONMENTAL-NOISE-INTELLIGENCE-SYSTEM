'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { ApiError, api } from '@/lib/api'
import { STATUS_NAMES, calibrationText, formatUtc } from '@/lib/utils'
import type { DeviceRecord, SourceMode } from '@/types/iot'

export function DeviceFleet({
  devices,
  source,
  adminToken,
  onNeedAdmin,
  onCreated,
  onError,
}: {
  devices: DeviceRecord[]
  source: SourceMode
  adminToken: string
  onNeedAdmin: () => void
  onCreated: () => void
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const visible = devices.filter((device) => Boolean(device.demo) === (source === 'demo'))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adminToken) {
      onNeedAdmin()
      return
    }
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const created = await api<{ device_token: string }>('/api/devices', adminToken, {
        method: 'POST',
        body: JSON.stringify({
          id: String(form.get('id') ?? ''),
          name: String(form.get('name') ?? ''),
          location: String(form.get('location') ?? ''),
        }),
      })
      setToken(created.device_token)
      onCreated()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onNeedAdmin()
      onError(err instanceof Error ? err.message : 'Could not register that sensor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-300">Each sensor gets an ID and a one-time token.</p>
        <Button onClick={() => { setToken(''); setOpen(true) }}>Register a sensor</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.length === 0 ? (
          <p className="text-sm text-slate-400">{source === 'demo' ? 'No practice sensors in this view.' : 'No sensors yet. Use Register a sensor to add the first one.'}</p>
        ) : visible.map((device) => (
          <article key={device.id} className="rounded-lg border border-line bg-obsidian p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium">{device.name}</h3>
              <span className={device.status === 'offline' ? 'font-mono text-[11px] text-rose-400' : device.status === 'online' ? 'font-mono text-[11px] text-emerald-400' : 'font-mono text-[11px] text-amber-400'}>
                {STATUS_NAMES[device.status] ?? device.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{device.location}</p>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 font-mono text-[11px] text-slate-300">
              <dt className="text-slate-500">ID</dt><dd>{device.id}</dd>
              <dt className="text-slate-500">Firmware</dt><dd>{device.firmware}</dd>
              <dt className="text-slate-500">Calibration</dt><dd>{calibrationText(device.calibration)}</dd>
              <dt className="text-slate-500">Readings</dt><dd>{Number(device.readings).toLocaleString()}</dd>
              <dt className="text-slate-500">Last seen</dt><dd>{device.last_seen ? `${formatUtc(device.last_seen)} UTC` : 'Not yet'}</dd>
            </dl>
          </article>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-line p-4 text-sm leading-6 text-slate-300">
        <h3 className="font-medium text-slate-100">Connect a device</h3>
        <p className="mt-1">The ESP32 sketch in this project can send readings here. Register a sensor, copy its one-time token, then put that token in the sketch with your Wi-Fi name and the server address.</p>
        <p className="mt-2 font-mono text-xs text-emerald-400">POST /api/observations · header X-Device-Token</p>
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Register a sensor" description="The token is shown once. Copy it into the device. It is not stored in this browser.">
        {token ? (
          <div>
            <p className="font-mono text-xs break-all text-emerald-300">{token}</p>
            <Button className="mt-3" onClick={() => void navigator.clipboard.writeText(token)}>Copy token</Button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="grid gap-3">
            <label className="text-sm">Sensor ID
              <input name="id" required pattern="[a-zA-Z0-9_-]{3,48}" spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="node_01" className="mt-1 h-9 w-full rounded border border-line bg-obsidian px-2 font-mono text-sm" />
            </label>
            <label className="text-sm">Name
              <input name="name" required maxLength={80} placeholder="Front gate" className="mt-1 h-9 w-full rounded border border-line bg-obsidian px-2 text-sm" />
            </label>
            <label className="text-sm">Place
              <input name="location" required maxLength={100} placeholder="Campus gate" className="mt-1 h-9 w-full rounded border border-line bg-obsidian px-2 text-sm" />
            </label>
            <Button type="submit" disabled={busy}>Create sensor</Button>
          </form>
        )}
      </Modal>
    </div>
  )
}
