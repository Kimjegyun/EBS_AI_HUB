// Reads printed asset numbers (labels without QR/barcode, e.g. "QM00044-0206-000")
// with Tesseract OCR running on the device. All files are self-hosted: the engine via
// Vite, the English model via the ocr-model plugin in vite.config.ts.
//
// OCR misreads are expected (on field photos "000" came back as "g0g"), so a reading
// only counts when it maps to an asset in the master: exact number first, otherwise
// the first two groups must identify a single asset.
import type { Worker } from 'tesseract.js'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import type { Asset } from './types'

const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])

let workerPromise: Promise<Worker> | null = null
function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker, PSM } = await import('tesseract.js')
    const simd = typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE)
    const worker = await createWorker('eng', 1, {
      workerPath: workerUrl,
      corePath: simd ? coreSimdUrl : coreUrl,
      langPath: `${import.meta.env.BASE_URL}tesseract`,
      gzip: true,
      workerBlobURL: false,
    })
    // Sparse text: labels mix a table, Korean captions and the number at odd angles.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    return worker
  })().catch((error) => { workerPromise = null; throw error })
  return workerPromise
}

/**
 * Grayscale + contrast stretch (2nd–98th percentile) on a canvas no larger than
 * `maxSide`. Evens out dim, warm or washed-out lighting before OCR.
 */
async function preprocess(source: ImageBitmap | HTMLCanvasElement, rotation: 0 | 90 | 180 | 270, mirror = false, maxSide = 2400, minSide = 2000): Promise<HTMLCanvasElement> {
  // Shrink huge photos, but enlarge small ones (e.g. 1280px attachments): Tesseract
  // needs characters roughly 20px+ tall.
  const longest = Math.max(source.width, source.height)
  const scale = longest > maxSide ? maxSide / longest : longest < minSide ? minSide / longest : 1
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale)
  const canvas = document.createElement('canvas')
  const sideways = rotation === 90 || rotation === 270
  canvas.width = sideways ? h : w
  canvas.height = sideways ? w : h
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('이미지 처리를 지원하지 않는 브라우저입니다.')
  context.imageSmoothingQuality = 'high'
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((rotation * Math.PI) / 180)
  if (mirror) context.scale(-1, 1)
  context.drawImage(source, -w / 2, -h / 2, w, h)
  context.setTransform(1, 0, 0, 1, 0, 0)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  const histogram = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    data[i] = gray
    histogram[gray | 0]++
  }
  const pixels = data.length / 4
  let low = 0, high = 255, seen = 0
  for (let v = 0; v < 256; v++) { seen += histogram[v]; if (seen >= pixels * 0.02) { low = v; break } }
  seen = 0
  for (let v = 255; v >= 0; v--) { seen += histogram[v]; if (seen >= pixels * 0.02) { high = v; break } }
  const range = Math.max(1, high - low)
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((data[i] - low) * 255) / range))
    data[i] = data[i + 1] = data[i + 2] = v
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * OCR text of an image (photo blob or captured camera frame). Stops at the first
 * orientation whose text contains an asset-number shaped reading. Order follows how
 * often it happens on site: upright, upside down (label or phone turned around),
 * then sideways; mirrored (shot through glass or a reflection) only as a last resort,
 * so the usual cases stay fast.
 */
const ORIENTATIONS: { rotation: 0 | 90 | 180 | 270; mirror: boolean }[] = [
  { rotation: 0, mirror: false }, { rotation: 180, mirror: false },
  { rotation: 90, mirror: false }, { rotation: 270, mirror: false },
  { rotation: 0, mirror: true }, { rotation: 180, mirror: true },
]
export async function recognizeAssetText(source: Blob | HTMLCanvasElement): Promise<string> {
  const worker = await getWorker()
  const image = source instanceof Blob ? await createImageBitmap(source) : source
  try {
    let first = ''
    for (const { rotation, mirror } of ORIENTATIONS) {
      const { data } = await worker.recognize(await preprocess(image, rotation, mirror))
      if (!first) first = data.text
      if (extractAssetCandidates(data.text).length) return data.text
    }
    return first
  } finally {
    if ('close' in image) image.close()
  }
}

// Letters OCR commonly returns in place of digits on these labels.
const TO_DIGIT: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0', U: '0', I: '1', l: '1', L: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9', T: '7',
}
const digits = (value: string) => [...value].map((ch) => TO_DIGIT[ch] ?? ch).join('').replace(/\D/g, '')

export interface OcrCandidate {
  /** Text as read, e.g. "QM00044-0206-g0g". */
  raw: string
  prefix: string
  serial: string
  item: string
  /** Last group after digit correction; may be shorter than 3 when misread. */
  suffix: string
}

/**
 * Asset-number shaped readings: hyphenated new "QM00044-0206-000" / old
 * "QM44-0206-000", and the unhyphenated print on older dot-matrix labels
 * ("QV000230282000"). Random text that happens to fit is rejected later by the
 * master lookup.
 */
export function extractAssetCandidates(text: string): OcrCandidate[] {
  const found = new Map<string, OcrCandidate>()
  const add = (raw: string, prefix: string, serial: string, item: string, suffix: string) => {
    if ((serial.length !== 5 && serial.length !== 2) || item.length !== 4) return
    found.set(`${prefix}${serial}${item}${suffix}`, { raw: raw.trim(), prefix: prefix.toUpperCase(), serial, item, suffix })
  }
  const hyphenated = /([A-Za-z]{2})\s*([0-9A-Za-z|!]{5}|[0-9A-Za-z|!]{2})\s*[-–—~.]\s*([0-9A-Za-z|!]{4})\s*[-–—~.]?\s*([0-9A-Za-z|!]{1,3})?/g
  for (const match of text.matchAll(hyphenated)) add(match[0], match[1], digits(match[2]), digits(match[3]), digits(match[4] ?? ''))
  const compact = /([A-Za-z]{2})([0-9A-Za-z|!]{12}|[0-9A-Za-z|!]{9})(?![0-9A-Za-z])/g
  for (const match of text.matchAll(compact)) {
    const body = digits(match[2])
    if (body.length === 12) add(match[0], match[1], body.slice(0, 5), body.slice(5, 9), body.slice(9))
    else if (body.length === 9) add(match[0], match[1], body.slice(0, 2), body.slice(2, 6), body.slice(6))
  }
  return [...found.values()]
}

const looseKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
const formatted = (c: OcrCandidate, suffix: string) => `${c.prefix}${c.serial}-${c.item}-${suffix}`

/**
 * Maps an OCR candidate to a master asset (current or old number). Exact match
 * first; otherwise the first two groups must identify one asset, with the last
 * group picked by the closest digits (ties prefer "000", the usual main asset).
 */
// Letters OCR confuses in the 2-letter prefix (e.g. "QM" read as "GM").
const PREFIX_LOOKALIKES: Record<string, string[]> = { G: ['Q', 'C', 'O'], Q: ['O', 'G'], O: ['Q', 'D', 'C'], C: ['G', 'O'], D: ['O', 'Q'], '0': ['O', 'Q'], '6': ['G'] }

export function matchOcrCandidate(candidate: OcrCandidate, assets: Asset[], lookup: (assetNo: string) => Asset | undefined): Asset | undefined {
  const direct = matchExactCandidate(candidate, assets, lookup)
  if (direct) return direct
  // Only when the prefix as read matches nothing: try look-alike first letters.
  for (const [i, ch] of [...candidate.prefix].entries()) {
    for (const alt of PREFIX_LOOKALIKES[ch] ?? []) {
      const prefix = candidate.prefix.slice(0, i) + alt + candidate.prefix.slice(i + 1)
      const asset = matchExactCandidate({ ...candidate, prefix }, assets, lookup)
      if (asset) return asset
    }
  }
  return undefined
}

function matchExactCandidate(candidate: OcrCandidate, assets: Asset[], lookup: (assetNo: string) => Asset | undefined): Asset | undefined {
  if (candidate.suffix.length === 3) {
    const exact = lookup(formatted(candidate, candidate.suffix))
    if (exact) return exact
  }
  const head = looseKey(`${candidate.prefix}${candidate.serial}${candidate.item}`)
  const options = assets.flatMap((asset) => [asset.assetNo, asset.oldAssetNo]
    .filter((no): no is string => !!no && looseKey(no).length === head.length + 3 && looseKey(no).startsWith(head))
    .map((no) => ({ asset, suffix: looseKey(no).slice(head.length) })))
  if (!options.length) return undefined
  const score = (suffix: string) => [...suffix].filter((ch, i) => candidate.suffix[i] === ch).length
  options.sort((a, b) => score(b.suffix) - score(a.suffix) || Number(b.suffix === '000') - Number(a.suffix === '000'))
  const [best, second] = options
  if (second && second.asset !== best.asset && score(second.suffix) === score(best.suffix) && (second.suffix === '000') === (best.suffix === '000')) return undefined
  return best.asset
}
