import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from '../server/node_modules/xlsx/xlsx'
import { readWorkbook, validateWorkbookSize } from '../server/src/lib/safeWorkbook'

test('isolated parser reads current workbook format and legacy XLS', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['자산번호', '자산명'], ['A-001', '노트북']]), '자산')
  for (const bookType of ['xlsx', 'xls'] as const) {
    const data = XLSX.write(wb, { type: 'buffer', bookType })
    const parsed = await readWorkbook(data)
    assert.equal(parsed.Sheets['자산'].A2.v, 'A-001')
    assert.equal(parsed.Sheets['자산'].B2.v, '노트북')
  }
})

test('rejects oversized files, inflated ZIP budgets and extreme sheet ranges', async () => {
  assert.throws(() => validateWorkbookSize(Buffer.alloc(21 * 1024 * 1024)), /20MB/)
  const zip = Buffer.alloc(46 + 22)
  zip.writeUInt32LE(0x02014b50, 0)
  zip.writeUInt32LE(101 * 1024 * 1024, 24)
  zip.writeUInt32LE(0x06054b50, 46)
  zip.writeUInt16LE(1, 56)
  // Mark as a ZIP so the central-directory budget is checked.
  const input = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), zip])
  input.writeUInt32LE(4, 46 + 4 + 16)
  assert.throws(() => validateWorkbookSize(input), /100MB/)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, { A1: { t: 's', v: 'data' }, '!ref': 'A1:A100001' }, 'TooLarge')
  await assert.rejects(readWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), /제한/)
})
