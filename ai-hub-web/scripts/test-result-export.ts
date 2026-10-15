import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildResultExport } from '../src/apps/inventory/resultExport'
const rows = [
  { assetNo: 'A', parentDept: 'HQ', verifierDept: 'Dept A', verifier: 'One', name: '=1+1', surveyedAt: '2026-09-22T00:13:59.999Z' },
  { assetNo: 'B', parentDept: 'HQ', verifierDept: 'Dept A', verifier: 'Two' },
  { assetNo: 'C', parentDept: 'HQ', verifierDept: 'Dept B', verifier: 'One' },
] as any
for (const [dept, person, expected] of [['', '', ['A','B','C']], ['Dept A','',['A','B']], ['', 'One', ['A','C']], ['Dept A','One',['A']]] as const) {
  const result = await buildResultExport(rows, dept, person)
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(result.buffer as any)
  const sheet = book.worksheets[0]
  assert.equal(result.count, expected.length)
  assert.deepEqual(Array.from({length: result.count}, (_, index) => sheet.getCell(index + 2, 4).value), expected)
  assert.equal(sheet.getCell('E2').type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('L2').value, '2026-09-22 09:13')
  assert.equal(book.worksheets.length, 1)
}
await assert.rejects(buildResultExport(rows, 'missing', ''), /./)
const multiHeadquarters = [...rows, { ...rows[0], assetNo: 'D', parentDept: 'Other HQ' }]
for (const [hq, dept, person, expected] of [
  ['HQ', '', '', ['A', 'B', 'C']],
  ['HQ', 'Dept A', '', ['A', 'B']],
  ['HQ', 'Dept A', 'One', ['A']],
  ['Other HQ', 'Dept A', 'One', ['D']],
] as const) {
  const result = await buildResultExport(multiHeadquarters, dept, person, hq)
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(result.buffer as any)
  assert.deepEqual(Array.from({ length: result.count }, (_, index) => book.worksheets[0].getCell(index + 2, 4).value), expected)
}
await assert.rejects(buildResultExport(rows, '', '', 'missing'), /./)
console.log('PASS headquarters, department and individual exports isolate identical names across headquarters')
console.log('PASS all, department, operator, combined filters; XLSX rows and literal cells; empty selection rejected')

const groupedRows = [
  { ...rows[0], parentDept: '융합기술본부', dept: '융합기술본부 AI기술기획부' },
  { ...rows[1], parentDept: '융합기술본부', dept: 'AI기술기획부' },
  { ...rows[2], parentDept: '다른본부', dept: '다른본부지원팀' },
]
const grouped = await buildResultExport(groupedRows, '', '')
const groupedBook = new ExcelJS.Workbook()
await groupedBook.xlsx.load(grouped.buffer as any)
assert.deepEqual(groupedBook.worksheets.map(sheet => sheet.name), ['융합기술본부', '다른본부'])
assert.equal(groupedBook.worksheets[0].rowCount, 3)
assert.equal(groupedBook.worksheets[0].getCell('F2').value, 'AI기술기획부')
assert.equal(groupedBook.worksheets[0].getCell('F3').value, 'AI기술기획부')
assert.equal(groupedBook.worksheets[0].getCell('L2').value, '2026-09-22 09:13')
assert.equal(groupedBook.worksheets[1].getCell('F2').value, '다른본부지원팀')
assert.equal(groupedRows[0].dept, '융합기술본부 AI기술기획부')
const collisions = await buildResultExport(['HQ/A', 'HQ:A', 'A'.repeat(35), 'A'.repeat(34) + 'B'].map(parentDept => ({ ...rows[0], parentDept })), '', '')
const collisionBook = new ExcelJS.Workbook()
await collisionBook.xlsx.load(collisions.buffer as any)
assert.equal(collisionBook.worksheets.length, 4)
assert.equal(new Set(collisionBook.worksheets.map(sheet => sheet.name)).size, 4)
console.log('PASS headquarters tabs, installation department separation, time format, source preservation and valid unique sheet names')

const marked = await buildResultExport([
  { ...rows[0], confirmed: true, parentDept: '융합기술본부', verifierDept: '융합기술본부 AI?????' },
  { ...rows[1], confirmed: false, parentDept: '융합기술본부', verifierDept: 'AI?????' },
], 'AI?????', '', '융합기술본부')
const markedBook = new ExcelJS.Workbook()
await markedBook.xlsx.load(marked.buffer as any)
assert.equal(marked.count, 2)
assert.equal(markedBook.worksheets[0].getCell('B2').value, 'AI?????')
assert.equal((markedBook.worksheets[0].getCell('D2').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFFFFF00')
assert.notEqual((markedBook.worksheets[0].getCell('D3').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFFFFF00')
console.log('PASS normalized survey department filters and confirmed-only yellow asset cells')
