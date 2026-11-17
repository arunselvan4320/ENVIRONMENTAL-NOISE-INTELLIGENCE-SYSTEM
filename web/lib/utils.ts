import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatIndex(value: number | null | undefined, digits = 3) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

export function formatUtc(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleTimeString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function errorText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== 'object') return 'Check this value and try again.'
        const record = item as { loc?: unknown; msg?: unknown }
        const where = Array.isArray(record.loc)
          ? record.loc.filter((part) => part !== 'body').join(' ')
          : ''
        const message = typeof record.msg === 'string' ? record.msg : 'Check this value and try again.'
        return where ? `${where}: ${message}` : message
      })
      .join(' ')
  }
  return 'Something went wrong. Please try again.'
}

export const FLAG_NAMES: Record<string, string> = {
  clipping: 'mic overloaded',
  clock_unsynced: 'clock not set',
  wind_suspected: 'possible wind',
  packet_gap: 'gap in readings',
}

export const STATUS_NAMES: Record<string, string> = {
  demo: 'Practice',
  online: 'Reporting',
  offline: 'Not reporting',
}

export function calibrationText(value: string) {
  if (value === 'unvalidated') return 'Not calibrated'
  if (value === 'synthetic') return 'Practice'
  return value
}
