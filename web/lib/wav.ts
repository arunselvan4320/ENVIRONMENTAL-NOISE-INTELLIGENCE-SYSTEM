export function makeWavFile(samples: Int16Array, rate: number, name: string) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, samples[i], true)
  return new File([buffer], name, { type: 'audio/wav' })
}

export function makeTestTone() {
  const rate = 16000
  const samples = new Int16Array(rate * 3)
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((i / rate) * Math.PI * 2 * (440 + 100 * Math.sin(i / rate))) * 9000
  }
  return makeWavFile(samples, rate, 'test-tone.wav')
}

export function looksLikeWav(file: File) {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return name.endsWith('.wav') || type === 'audio/wav' || type === 'audio/wave' || type === 'audio/x-wav'
}
