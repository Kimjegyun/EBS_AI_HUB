/// <reference lib="webworker" />
// Decodes full-resolution camera frames with zxing-cpp (WASM) off the main thread.
// html5-qrcode only decodes a canvas sized to the on-screen preview (~360px wide on
// phones), which keeps QR readable but blurs thin 1D bars together; reading the
// native frame here is what makes Code 128/39 asset barcodes scannable.
// It also decodes saved label photos (JPEG/PNG files) for the photo import.
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path) },
})

const options: ReaderOptions = {
  formats: ['Code128', 'Code39', 'Code93', 'Codabar', 'ITF', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'QRCode', 'DataMatrix'],
  tryHarder: true,
  // Labels may be held sideways or upside down relative to the phone.
  tryRotate: true,
  tryInvert: false,
  maxNumberOfSymbols: 2,
}

// Photos are decoded once, so spend more effort: a label photo may hold an old and a
// new label, and glossy or slightly tilted barcodes on 12MP photos often only read
// after halving the image (verified on field photos of Mac Pro labels).
const photoPasses: ReaderOptions[] = [
  { ...options, tryInvert: true, maxNumberOfSymbols: 8, tryDownscale: true },
  { ...options, tryInvert: true, maxNumberOfSymbols: 8, tryDownscale: true, downscaleFactor: 2, downscaleThreshold: 500 },
]

/**
 * Flat-field correction: divides each pixel by its local mean brightness (box blur
 * via an integral image). Removes lighting gradients from side light or a lamp off
 * to one side. In tests on field photos with simulated side light, only this
 * variant recovered the barcodes.
 */
function flatField(image: ImageData): ImageData {
  const { width: w, height: h, data } = image
  const r = Math.max(8, Math.round(Math.min(w, h) / 24))
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row }
  }
  const out = new ImageData(w, h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0]
      const value = Math.max(0, Math.min(255, (200 * gray[y * w + x]) / (sum / ((x1 - x0) * (y1 - y0)) + 1)))
      const i = (y * w + x) * 4
      out.data[i] = out.data[i + 1] = out.data[i + 2] = value
      out.data[i + 3] = 255
    }
  }
  return out
}

// Lighting varies wildly on site (side light, glare, dim racks, reflective labels).
// Each camera frame uses the next strategy, so a hard-to-light label gets three
// different chances every ~0.4s at no extra cost per frame.
const frameVariants: { flat: boolean; options: ReaderOptions }[] = [
  { flat: false, options },
  { flat: true, options },
  { flat: false, options: { ...options, tryInvert: true, tryDownscale: true, downscaleFactor: 2, downscaleThreshold: 500 } },
]
let frameCount = 0

/**
 * Slant of barcode bars, in degrees within (-45, 45]. 1D barcodes only read when
 * bars are within ~2° of vertical or horizontal (measured on field photos), so a
 * label shot at an angle needs straightening. Edge directions are histogrammed
 * (weighted by edge strength) and the strongest direction wins; barcodes dominate it
 * with many parallel edges. Returns null when nothing clearly slanted is found.
 */
function barSlant(image: ImageData): number | null {
  const { width: w, height: h, data } = image
  // Block-average down to ~640px (smoothing), then Sobel 3×3. Plain pixel-pair
  // differences snapped every slant to 0° or 45°: along a near-vertical thin bar the
  // vertical pair almost never straddles the edge.
  const step = Math.max(1, Math.round(Math.max(w, h) / 640))
  const sw = Math.floor(w / step), sh = Math.floor(h / step)
  const small = new Float32Array(sw * sh)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let sum = 0
      for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) {
        const i = ((y * step + dy) * w + x * step + dx) * 4
        sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      }
      small[y * sw + x] = sum / (step * step)
    }
  }
  // Folded mod 90: bar edges and the label/bar ends at right angles add up instead of
  // competing. Weighted by squared (L2) strength; an L1 weight favours diagonals.
  const bins = new Float64Array(90)
  const p = (x: number, y: number) => small[y * sw + x]
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const gx = (p(x + 1, y - 1) + 2 * p(x + 1, y) + p(x + 1, y + 1)) - (p(x - 1, y - 1) + 2 * p(x - 1, y) + p(x - 1, y + 1))
      const gy = (p(x - 1, y + 1) + 2 * p(x, y + 1) + p(x + 1, y + 1)) - (p(x - 1, y - 1) + 2 * p(x, y - 1) + p(x + 1, y - 1))
      const strength = gx * gx + gy * gy
      if (strength < 40000) continue
      const angle = ((((Math.atan2(gy, gx) * 180) / Math.PI) % 90) + 90) % 90
      bins[Math.floor(angle) % 90] += strength
    }
  }
  let best = 0, bestWeight = 0
  for (let a = 0; a < 90; a++) {
    const weight = bins[(a + 88) % 90] + bins[(a + 89) % 90] * 2 + bins[a] * 3 + bins[(a + 1) % 90] * 2 + bins[(a + 2) % 90]
    if (weight > bestWeight) { bestWeight = weight; best = a }
  }
  const slant = best > 45 ? best - 90 : best
  return Math.abs(slant) >= 3 ? slant : null
}

/** Rotates pixels by `degrees` (OffscreenCanvas; null where workers lack it). */
function rotated(image: ImageData, degrees: number): ImageData | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  const source = new OffscreenCanvas(image.width, image.height)
  source.getContext('2d')?.putImageData(image, 0, 0)
  const radians = (degrees * Math.PI) / 180
  const w = Math.ceil(Math.abs(image.width * Math.cos(radians)) + Math.abs(image.height * Math.sin(radians)))
  const h = Math.ceil(Math.abs(image.width * Math.sin(radians)) + Math.abs(image.height * Math.cos(radians)))
  const target = new OffscreenCanvas(w, h)
  const context = target.getContext('2d')
  if (!context) return null
  context.fillStyle = '#fff'
  context.fillRect(0, 0, w, h)
  context.translate(w / 2, h / 2)
  context.rotate(radians)
  context.drawImage(source, -image.width / 2, -image.height / 2)
  return context.getImageData(0, 0, w, h)
}

/** Straighten slanted bars and read once more; only called after a normal read found nothing. */
async function readDeskewed(image: ImageData): Promise<string[]> {
  const slant = barSlant(image)
  if (slant === null) return []
  // The estimate runs ~2° short of the true slant (field photos: 7/17/23/32 for
  // 10/20/25/35°) and bars must be within ~2°, so try a little past it first.
  const sign = Math.sign(slant)
  for (const correction of [slant + 2 * sign, slant, slant + 4 * sign]) {
    const straight = rotated(image, -correction)
    if (!straight) return []
    const texts = (await readBarcodes(straight, options)).filter((result) => result.isValid && result.text).map((result) => result.text)
    if (texts.length) return texts
  }
  return []
}

/** Photo pixels for the flat-field pass (OffscreenCanvas in workers; skipped where unsupported). */
async function photoPixels(file: Blob): Promise<ImageData | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

type Request = { id: number; image: ImageData; deskew?: boolean } | { id: number; file: Blob }

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    const texts = new Set<string>()
    if ('file' in request) {
      const bytes = new Uint8Array(await request.file.arrayBuffer())
      for (const pass of photoPasses) {
        for (const result of await readBarcodes(bytes, pass)) if (result.isValid && result.text) texts.add(result.text)
      }
      // Nothing read: retry on a flat-field corrected copy (uneven lighting), then straightened (slanted shot).
      if (!texts.size) {
        const pixels = await photoPixels(request.file).catch(() => null)
        if (pixels) {
          for (const result of await readBarcodes(flatField(pixels), photoPasses[0])) if (result.isValid && result.text) texts.add(result.text)
          if (!texts.size) for (const text of await readDeskewed(pixels)) texts.add(text)
        }
      }
    } else {
      const variant = frameVariants[frameCount++ % frameVariants.length]
      const image = variant.flat ? flatField(request.image) : request.image
      for (const result of await readBarcodes(image, variant.options)) if (result.isValid && result.text) texts.add(result.text)
      // Straightening costs ~15–25ms plus up to 3 reads, so while aiming (nothing read yet)
      // it runs on every 3rd frame only; reads that succeed never pay for it.
      if (!texts.size && request.deskew && frameCount % 3 === 0) for (const text of await readDeskewed(request.image)) texts.add(text)
    }
    self.postMessage({ id: request.id, texts: [...texts] })
  } catch (error) {
    self.postMessage({ id: request.id, texts: [], error: error instanceof Error ? error.message : String(error) })
  }
}
