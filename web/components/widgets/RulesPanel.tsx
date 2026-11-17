'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, api } from '@/lib/api'
import { formatIndex, formatUtc } from '@/lib/utils'
import type { AlertRecord, SourceMode } from '@/types/iot'

export function RulesPanel({
  alerts,
  threshold,
  source,
  adminToken,
  onNeedAdmin,
  onChanged,
  onError,
  onMessage,
}: {
  alerts: AlertRecord[]
  threshold: number
  source: SourceMode
  adminToken: string
  onNeedAdmin: () => void
  onChanged: () => void
  onError: (message: string) => void
  onMessage: (message: string) => void
}) {
  const [value, setValue] = useState(String(threshold))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setValue(threshold.toFixed(2))
  }, [threshold, editing])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!adminToken) {
      onNeedAdmin()
      return
    }
    try {
      await api('/api/settings', adminToken, { method: 'PUT', body: JSON.stringify({ threshold: Number(value) }) })
      onMessage('Alert line saved. It applies to new readings.')
      onChanged()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onNeedAdmin()
      onError(err instanceof Error ? err.message : 'Could not save the alert line.')
    }
  }

  async function acknowledge(id: number) {
    if (!adminToken) {
      onNeedAdmin()
      return
    }
    try {
      await api(`/api/alerts/${id}/acknowledge`, adminToken, { method: 'POST' })
      onMessage('Marked as seen')
      onChanged()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onNeedAdmin()
      onError(err instanceof Error ? err.message : 'Could not update that alert.')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(event) => void save(event)} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Alert line
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            type="number"
            inputMode="decimal"
            min={0.1}
            max={1}
            step={0.01}
            required
            className="mt-1 block h-9 w-28 rounded border border-line bg-obsidian px-2 font-mono text-sm"
          />
        </label>
        <Button type="submit">Save</Button>
        <p className="max-w-xl text-sm text-slate-400">A project setting between 0.10 and 1. It is not a legal noise limit or a health warning.</p>
      </form>
      <div className="space-y-2">
        {alerts.length === 0 ? <p className="text-sm text-slate-400">No alerts for this filter. Readings that cross the alert line show up here.</p> : null}
        {alerts.map((alert) => (
          <article key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-line px-3 py-3">
            <div>
              <h3 className="text-sm">Crossed the alert line · {alert.device_name}</h3>
              <p className="font-mono text-[11px] text-slate-400">
                {formatIndex(alert.level)} · {formatUtc(alert.timestamp)} UTC · {source === 'demo' ? 'practice' : 'live sensor'}
              </p>
            </div>
            {alert.acknowledged ? <span className="font-mono text-[11px] text-emerald-400">Seen</span> : (
              <Button variant="secondary" onClick={() => void acknowledge(alert.id)}>Mark as seen</Button>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
