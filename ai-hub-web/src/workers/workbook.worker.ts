import * as XLSX from 'xlsx'

// ZIP expansion budgets are checked before SheetJS allocates worksheets.
function validate(buffer: ArrayBuffer) {
  if (buffer.byteLength < 4 || buffer.byteLength > 20 * 1024 * 1024) throw new Error('엑셀 파일 크기가 올바르지 않습니다. (최대 20MB)')
  const view = new DataView(buffer)
  if (view.getUint16(0, true) !== 0x4b50) return
  let end = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('손상된 엑셀 압축 파일입니다.')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true), expanded = 0
  if (count > 4096) throw new Error('엑셀 내부 파일 수가 너무 많습니다.')
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('엑셀 압축 구조가 잘못되었습니다.')
    expanded += view.getUint32(offset + 24, true)
    if (expanded > 100 * 1024 * 1024) throw new Error('압축 해제 후 엑셀 크기 제한(100MB)을 초과했습니다.')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
}
self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    validate(data)
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellFormula: false, cellHTML: false, bookVBA: false })
    if (workbook.SheetNames.length > 64) throw new Error('시트 수 제한(64개)을 초과했습니다.')
    let cells = 0
    for (const sheet of Object.values(workbook.Sheets)) {
      if (!sheet['!ref']) continue
      const range = XLSX.utils.decode_range(sheet['!ref'])
      cells += (range.e.r + 1) * (range.e.c + 1)
      if (range.e.r >= 100000 || range.e.c >= 512 || cells > 2000000) throw new Error('엑셀 행·열·셀 수 제한을 초과했습니다.')
    }
    self.postMessage({ workbook })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '엑셀 처리 실패' }) }
}
