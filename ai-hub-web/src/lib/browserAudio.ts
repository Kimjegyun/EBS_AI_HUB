const SAMPLE_RATE = 16000
const CHUNK_SECONDS = 120

export function encodePcmWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer)
  const text = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true)
  }
  return buffer
}

/** Process one input and yield/upload one bounded chunk at a time. No server fallback. */
export async function* prepareBrowserAudio(file: File): AsyncGenerator<File> {
  if (!window.AudioContext || !window.OfflineAudioContext) throw new Error('이 브라우저는 사용자 PC 음성 처리를 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용하거나 관리자에게 중앙 처리 전환을 요청하세요.')
  if (file.size > 50 * 1024 * 1024) throw new Error('음성 파일은 50MB 이하여야 합니다.')
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  let decoded: AudioBuffer
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()) }
  catch { throw new Error('사용자 PC에서 이 음성을 읽지 못했습니다. WAV·MP3로 변환하거나 관리자에게 중앙 처리 전환을 요청하세요.') }
  finally { await context.close() }
  if (!decoded.length || decoded.duration > 3600) throw new Error('사용자 PC 음성 처리는 파일당 1시간까지 지원합니다. 파일을 나누어 주세요.')
  for (let offset = 0, index = 0; offset < decoded.duration; offset += CHUNK_SECONDS, index++) {
    const seconds = Math.min(CHUNK_SECONDS, decoded.duration - offset)
    const offline = new OfflineAudioContext(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded; source.connect(offline.destination); source.start(0, offset, seconds)
    const mono = await offline.startRendering()
    yield new File([encodePcmWav(mono.getChannelData(0))], `part-${String(index + 1).padStart(4, '0')}.wav`, { type: 'audio/wav' })
  }
}

export async function testBrowserResources(): Promise<string> {
  const wav = encodePcmWav(new Float32Array(1600).fill(0.1))
  let chunks = 0
  for await (const chunk of prepareBrowserAudio(new File([wav], 'test.wav', { type: 'audio/wav' }))) {
    if (chunk.size !== wav.byteLength) throw new Error('음성 변환 결과 검증에 실패했습니다.')
    chunks++
  }
  if (chunks !== 1) throw new Error('음성 구간 생성에 실패했습니다.')
  return '현재 PC의 음성 변환·분할 검증을 통과했습니다.'
}
