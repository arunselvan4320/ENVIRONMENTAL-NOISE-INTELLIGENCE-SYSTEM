'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatIndex } from '@/lib/utils'
import { looksLikeWav, makeTestTone, makeWavFile } from '@/lib/wav'
import type { AiStatus, AudioAnalysis } from '@/types/iot'

const REST_NOTE = 'The browser asks for the microphone only when you press Listen. It records about 3 seconds. The clip is analysed on this server and is not saved. You can choose a WAV file instead.'

export function SoundLab({
  adminToken,
  ai,
  onPacket,
  onError,
  onDone,
}: {
  adminToken: string
  ai: AiStatus | null
  onPacket: (topic: string, body: unknown) => void
  onError: (message: string) => void
  onDone: (message: string) => void
}) {
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(REST_NOTE)
  const [listening, setListening] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const doneRef = useRef<((ok: boolean) => void) | null>(null)
  const alive = useRef(true)

  function stopMic() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
    const done = doneRef.current
    doneRef.current = null
    done?.(false)
    if (!busyRef.current) setListening(false)
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopMic()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const spec = analysis?.spectrogram
    if (!canvas || !spec?.length || !spec[0]?.length) return
    const context = canvas.getContext('2d')
    if (!context) return
    canvas.width = spec[0].length
    canvas.height = spec.length
    const image = context.createImageData(canvas.width, canvas.height)
    spec.forEach((row, y) => {
      row.forEach((value, x) => {
        const pixel = ((canvas.height - 1 - y) * canvas.width + x) * 4
        const t = Math.max(0, Math.min(1, (value + 100) / 90))
        image.data[pixel] = Math.round(40 + 204 * t)
        image.data[pixel + 1] = Math.round(20 + 40 * (1 - t))
        image.data[pixel + 2] = Math.round(40 * (1 - t))
        image.data[pixel + 3] = 255
      })
    })
    context.putImageData(image, 0, 0)
  }, [analysis])

  async function analyse(file: File) {
    if (busyRef.current) return
    if (!looksLikeWav(file)) {
      onError('Please choose a WAV file (.wav).')
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await api<AudioAnalysis>('/api/audio/analyse', adminToken, { method: 'POST', body: form })
      if (!alive.current) return
      setAnalysis(result)
      onPacket('noise/audio/analyse', {
        label: result.classification.label,
        model_version: result.classification.model_version,
        duration: result.duration,
        sample_rate: result.sample_rate,
        retention: result.retention,
      })
      onDone('Done. The audio was not saved.')
    } catch (err) {
      if (!alive.current) return
      onError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function listen() {
    if (busyRef.current || streamRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setNote('This browser cannot use the microphone. Choose a WAV file instead.')
      onError('This browser cannot use the microphone. Choose a WAV file instead.')
      return
    }
    setListening(true)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setListening(false)
      const name = err instanceof Error ? err.name : ''
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError'
      const message = denied
        ? 'The microphone was blocked. Allow it in the browser and press Listen again, or choose a WAV file.'
        : 'The microphone could not start. You can choose a WAV file instead.'
      setNote(message)
      onError(message)
      return
    }
    if (!alive.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream
    setNote('Listening for 3 seconds. The microphone is on. This clip is not saved.')
    const pieces: Float32Array[] = []
    try {
      const context = new AudioContext()
      contextRef.current = context
      if (context.state === 'suspended') await context.resume()
      if (typeof context.createScriptProcessor !== 'function') {
        stopMic()
        setNote('This browser cannot record from the microphone. Choose a WAV file instead.')
        onError('This browser cannot record from the microphone. Choose a WAV file instead.')
        return
      }
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const silent = context.createGain()
      silent.gain.value = 0
      processor.onaudioprocess = (event) => {
        pieces.push(new Float32Array(event.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(silent)
      silent.connect(context.destination)
      const finished = await new Promise<boolean>((resolve) => {
        doneRef.current = resolve
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          doneRef.current = null
          resolve(true)
        }, 3000)
      })
      processor.onaudioprocess = null
      processor.disconnect()
      source.disconnect()
      const rate = context.sampleRate
      stopMic()
      if (!finished || !alive.current) {
        setNote(REST_NOTE)
        return
      }
      const total = pieces.reduce((sum, piece) => sum + piece.length, 0)
      if (!total || !rate) {
        setNote('No sound was captured. Try again, or choose a WAV file.')
        onError('No sound was captured. Try again, or choose a WAV file.')
        return
      }
      const pcm = new Int16Array(total)
      let offset = 0
      pieces.forEach((piece) => {
        for (let i = 0; i < piece.length; i += 1) {
          const clamped = Math.max(-1, Math.min(1, piece[i]))
          pcm[offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
          offset += 1
        }
      })
      setNote(REST_NOTE)
      await analyse(makeWavFile(pcm, rate, 'listen-3s.wav'))
    } catch {
      stopMic()
      if (alive.current) {
        setNote('The microphone could not record. You can choose a WAV file instead.')
        onError('The microphone could not record. You can choose a WAV file instead.')
      }
    }
  }

  const found = analysis?.classification
  const wave = analysis?.waveform ?? []
  const span = Math.max(1, wave.length - 1)
  const wavePoints = wave.map((value, index) => `${(index / span) * 1000},${55 - value * 50}`).join(' ')
  const aiLabel = ai?.ready ? 'AI ready' : ai ? 'AI not set up' : 'Checking the AI…'

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <div>
        <p className={`mb-3 font-mono text-[11px] ${ai?.ready ? 'text-emerald-400' : 'text-amber-400'}`}>{aiLabel}</p>
        <label className="relative grid min-h-36 cursor-pointer place-items-center rounded border border-dashed border-line px-4 py-6 text-center">
          <input
            ref={fileRef}
            type="file"
            accept=".wav,audio/wav,audio/wave,audio/x-wav"
            aria-label="Choose a WAV file"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void analyse(file)
            }}
          />
          <span>
            <span className="block text-sm">Drop a WAV file here</span>
            <span className="mt-1 block text-xs text-slate-400">16-bit PCM · 8–96 kHz · 0.1–30 seconds · up to 6 MB</span>
          </span>
        </label>
        <div className="mt-3 grid gap-2">
          <Button variant="secondary" disabled={busy || listening} onClick={() => void analyse(makeTestTone())}>Try a test tone</Button>
          <Button variant="secondary" disabled={busy || listening} aria-busy={listening} onClick={() => void listen()}>{listening ? 'Listening…' : 'Listen for 3 seconds'}</Button>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300" role="status">{note}</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">The audio is processed in memory on this server and then discarded. It is not saved, and it is not sent to another service.</p>
        {busy ? <p className="mt-2 text-sm text-amber-300">Working on the sound… The first time can take longer while the model loads.</p> : null}
        {found && !busy ? (
          <div className="mt-4">
            <h3 className="text-xl">{found.label}</h3>
            <p className="mt-1 text-sm text-slate-300">{found.note}</p>
            {found.probabilities.length ? (
              <>
                <p className="mt-3 text-xs leading-5 text-slate-400">Score from 0 to 1. Higher means a stronger match. These are not percentages, and they may not add up to 1.</p>
                <ul className="mt-2 space-y-2">
                  {found.probabilities.map((item) => (
                    <li key={item.label}>
                      <div className="flex justify-between font-mono text-xs">
                        <span>{item.label}</span>
                        <span>{formatIndex(item.probability)}</span>
                      </div>
                      <div className="mt-1 h-1 rounded bg-line">
                        <div className="h-1 rounded bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, item.probability * 100))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div>
        <p className="mb-3 font-mono text-xs text-slate-400">
          {analysis
            ? `${analysis.duration}s · ${analysis.sample_rate.toLocaleString()} Hz · ${analysis.dbfs} dBFS (digital full scale, not a room decibel level)${analysis.clipping ? ' · the mic may have overloaded' : ''}`
            : 'The waveform and frequencies will show up here.'}
        </p>
        {wave.length ? (
          <svg viewBox="0 0 1000 110" role="img" aria-label="Waveform" className="h-28 w-full rounded border border-line bg-obsidian">
            <line x1="0" y1="55" x2="1000" y2="55" stroke="#1F2937" />
            <polyline points={wavePoints} fill="none" stroke="#10b981" strokeWidth="1.8" />
          </svg>
        ) : <div className="grid h-28 place-items-center rounded border border-line text-sm text-slate-500">No audio yet</div>}
        <canvas ref={canvasRef} aria-label="Frequency picture of the audio" className={analysis?.spectrogram?.length ? 'mt-3 h-44 w-full rounded border border-line' : 'hidden'} />
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {Object.entries(analysis?.features ?? {}).map(([key, value]) => (
            <div key={key} className="rounded border border-line px-2 py-2">
              <div className="text-[11px] uppercase text-slate-500">{key.replaceAll('_', ' ')}</div>
              <div className="font-mono text-sm">{formatIndex(value, key === 'centroid' || key === 'rolloff' ? 0 : 3)}{key === 'centroid' || key === 'rolloff' ? ' Hz' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
