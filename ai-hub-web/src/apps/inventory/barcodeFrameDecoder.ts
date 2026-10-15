/** Longest side of the scaled whole-frame pass (orientation-independent reading). */
const FULL_FRAME_SIDE = 1280

/** Crop of the camera frame matching the scanner's on-screen label strip. */
export function labelStripRect(videoWidth: number, videoHeight: number, viewRatio: number) {
  const height = Math.min(videoHeight, Math.round(videoWidth / viewRatio))
  return { x: 0, y: Math.round((videoHeight - height) / 2), width: videoWidth, height }
}

/**
 * Decodes saved label photos one at a time in the barcode worker. Returns the texts
 * found per file, in input order; a file that fails to decode yields an empty list.
 */
export async function decodePhotoFiles(files: Blob[], onProgress?: (done: number) => void): Promise<string[][]> {
  const worker = new Worker(new URL('./barcodeWorker.ts', import.meta.url), { type: 'module' })
  // A worker that fails to load never answers; stop waiting on it after the first error.
  let failed = false
  try {
    const decoded: string[][] = []
    for (const [index, file] of files.entries()) {
      decoded.push(failed ? [] : await new Promise<string[]>((resolve) => {
        worker.onmessage = (event: MessageEvent<{ id: number; texts: string[] }>) => { if (event.data.id === index) resolve(event.data.texts) }
        worker.onerror = () => { failed = true; resolve([]) }
        worker.postMessage({ id: index, file })
      }))
      onProgress?.(index + 1)
    }
    return decoded
  } finally {
    worker.terminate()
  }
}

/**
 * Continuously decodes native-resolution frames of `video` in a worker and reports
 * decoded texts. Only one frame is in flight at a time, so slow devices simply
 * decode less often instead of queueing work. Returns a stop function.
 */
export function startFrameDecoding(video: HTMLVideoElement, viewRatio: number, onText: (text: string) => void, intervalMs = 120) {
  const worker = new Worker(new URL('./barcodeWorker.ts', import.meta.url), { type: 'module' })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let nextId = 0
  let pending: { id: number; resolve: (texts: string[]) => void } | null = null

  worker.onmessage = (event: MessageEvent<{ id: number; texts: string[] }>) => {
    if (pending?.id === event.data.id) { pending.resolve(event.data.texts); pending = null }
  }
  // A worker that fails to load (old browser, blocked WASM) leaves html5-qrcode scanning on its own.
  worker.onerror = () => { stop() }

  // Alternate what each frame reads: the center strip at native resolution (small or
  // distant barcodes) and the whole frame scaled to FULL_FRAME_SIDE (labels turned
  // sideways or upside down extend outside the strip). In tests the scaled whole
  // frame decoded in the same ~6–9ms as the strip, so the frame rate is unchanged.
  let frameIndex = 0
  const decodeFrame = () => new Promise<string[]>((resolve) => {
    if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) { resolve([]); return }
    const whole = frameIndex++ % 2 === 1
    const rect = whole ? { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight } : labelStripRect(video.videoWidth, video.videoHeight, viewRatio)
    const scale = whole ? Math.min(1, FULL_FRAME_SIDE / Math.max(rect.width, rect.height)) : 1
    canvas.width = Math.round(rect.width * scale)
    canvas.height = Math.round(rect.height * scale)
    context.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    pending = { id: ++nextId, resolve }
    // When the normal read finds nothing, slanted bars are straightened and read again.
    worker.postMessage({ id: pending.id, image, deskew: true }, [image.data.buffer])
  })

  const tick = async () => {
    if (stopped) return
    if (!video.paused && !document.hidden) {
      const texts = await decodeFrame()
      if (stopped) return
      texts.forEach(onText)
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs)
  }

  function stop() {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    pending?.resolve([])
    pending = null
    worker.terminate()
  }

  void tick()
  return stop
}
