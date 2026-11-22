import { synthesize, TTS_SAMPLE_RATE } from '../api/speech.js'
import { useSettings } from '../settings.js'
import { recordTtsChars } from '../usage/apiUsage.js'

const writeAscii = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

/** TTS 返回裸 PCM（24kHz / 单声道 / 16-bit），封装成 WAV 以便下载与离线播放。 */
const pcmToWav = (pcm: Uint8Array): Blob => {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const size = pcm.byteLength
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + size, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, TTS_SAMPLE_RATE, true)
  view.setUint32(28, TTS_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, size, true)
  return new Blob([header, pcm as unknown as BlobPart], { type: 'audio/wav' })
}

const safeName = (name: string) =>
  (name || '语音').replace(/[\\/:*?"<>|]/g, '').slice(0, 48)

export const downloadSpeechAudio = async (text: string, title: string): Promise<string> => {
  const { apiKey, ttsVoice } = useSettings.getState()
  const controller = new AbortController()
  const stream = await synthesize(apiKey ?? '', text, ttsVoice, controller.signal)
  recordTtsChars(text.length)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    total += value.byteLength
  }
  const pcm = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    pcm.set(chunk, offset)
    offset += chunk.byteLength
  }
  const blob = pcmToWav(pcm)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeName(title)}.wav`
  anchor.click()
  URL.revokeObjectURL(url)
  return anchor.download
}
