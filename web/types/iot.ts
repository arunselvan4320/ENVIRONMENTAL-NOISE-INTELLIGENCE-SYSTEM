export type SourceMode = 'demo' | 'live'
export type SectionId = 'overview' | 'fleet' | 'stream' | 'rules' | 'settings'
export type LinkState = 'online' | 'warning' | 'offline'
export type DeviceStatus = 'demo' | 'online' | 'offline'

export interface TelemetryPayload<T = unknown> {
  topic: string
  receivedAt: string
  body: T
}

export interface PacketLogEntry {
  id: string
  topic: string
  receivedAt: string
  body: unknown
}

export interface DeviceRecord {
  id: string
  name: string
  location: string
  firmware: string
  calibration: string
  demo: number
  last_seen: string | null
  readings: number
  status: DeviceStatus
}

export interface ObservationRecord {
  id: number
  device_id: string
  device_name: string
  message_id?: string
  timestamp: string
  level: number
  label: string
  flags: string[]
  calibration: string
}

export interface OverviewSnapshot {
  source: SourceMode
  measurement: string
  threshold: number
  total: number
  valid: number
  flagged: number
  mean: number | null
  peak: number | null
  current: number | null
  exceedances: number
  series: { timestamp: string; index: number }[]
  classes: { label: string; count: number }[]
  recent: ObservationRecord[]
  generated_at: string
}

export interface AlertRecord {
  id: number
  device_id: string
  device_name: string
  timestamp: string
  level: number
  acknowledged: number
}

export interface ForecastPoint {
  minutes: number
  index: number
}

export interface ForecastMetric {
  model: string
  mae: number
  rmse: number
  n: number
}

export interface ForecastSnapshot {
  available: boolean
  note: string
  source?: SourceMode
  device_id?: string
  issued_at?: string
  last_observation?: string | null
  training_bins?: number
  stale?: boolean
  ai_evaluated?: boolean
  selected_model?: string
  points?: ForecastPoint[]
  metrics?: ForecastMetric[]
}

export interface HealthSnapshot {
  status: string
  demo_enabled: boolean
  classifier_trained: boolean
  measurement: string
  ai: AiStatus
}

export interface AiStatus {
  engine: string
  model_id: string
  revision: string
  dependencies_installed: boolean
  weights_available: boolean
  loaded: boolean
  ready: boolean
  last_error: string | null
  setup: string
}

export interface ClassScore {
  label: string
  probability: number
}

export interface AudioClassification {
  label: string
  confidence: number | null
  model_version: string
  probabilities: ClassScore[]
  available?: boolean
  note?: string
  windows_analysed?: number
}

export interface AudioAnalysis {
  features: Record<string, number>
  duration: number
  sample_rate: number
  clipping: boolean
  dbfs: number
  waveform: number[]
  spectrogram: number[][]
  classification: AudioClassification
  retention: string
}

export interface ConsoleFilters {
  source: SourceMode
  deviceId: string
  hours: number
}
