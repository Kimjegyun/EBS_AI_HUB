export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

export function heavyMobileWork(kind: 'audio' | 'workbook', size: number, duration?: number | null, expanded?: number, lowPower = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2): boolean {
  if (lowPower) return true
  if (kind === 'workbook') return size > 2 * 1024 * 1024 || (expanded ?? 0) > 16 * 1024 * 1024
  return size > 5 * 1024 * 1024 || duration == null || !Number.isFinite(duration) || duration > 180
}

export function audioDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const element = document.createElement('audio'), url = URL.createObjectURL(file)
    const finish = (value: number | null) => {
      clearTimeout(timer); element.onloadedmetadata = null; element.onerror = null
      element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); resolve(value)
    }
    const timer = setTimeout(() => finish(null), 3000)
    element.preload = 'metadata'
    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? element.duration : null)
    element.onerror = () => finish(null)
    element.src = url
  })
}

// Inspect ZIP directory only; do not inflate large workbooks on the device.
export function workbookExpandedSize(buffer: ArrayBuffer): number {
  const view = new DataView(buffer)
  if (buffer.byteLength < 22 || view.getUint16(0, true) !== 0x4b50) return buffer.byteLength
  try {
    let end = -1
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
    }
    if (end < 0) return Infinity
    const count = view.getUint16(end + 10, true)
    if (count > 4096) return Infinity
    let offset = view.getUint32(end + 16, true), total = 0
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) return Infinity
      total += view.getUint32(offset + 24, true)
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    }
    return total
  } catch { return Infinity }
}
