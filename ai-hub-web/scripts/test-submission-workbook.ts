import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildSubmissionWorkbook } from '../src/apps/inventory/submissionWorkbook'
import type { SurveySession, SurveyResult } from '../src/apps/inventory/types'

const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('본부A')
sheet.mergeCells('B1:D1')
sheet.getCell('B1').value = '현재'
sheet.getRow(2).values = ['자산번호', '설치부서', '설치장소', '사용자(부서)명', '부서이동']
sheet.addRow(['A-001', '기존부서', '장소', '기존사용자'])
sheet.addRow(['A-002', '미조사부서'])
sheet.getCell('B3').style = sheet.getCell('B4').style
sheet.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
workbook.addWorksheet('안내').getCell('A1').value = '원본 안내문'
const source = await workbook.xlsx.writeBuffer()
const result = (assetNo: string, date: string, dept: string): SurveyResult => ({ assetNo, surveyedAt: date, dept, verifier: '조사자', verifierDept: '조사부서', confirmed: true, name: '', location: '', model: '', spec: '', status: '정상', stickerMissing: false, note: '', matched: true })
const session = (id: string, results: SurveyResult[], name = '2026 정기조사'): SurveySession => ({ id, name, datasetId: 'a', parentDept: '본부A', createdAt: '2026-01-01', createdBy: '작성자', dept: '부서', completed: false, results: Object.fromEntries(results.map(r => [r.assetNo, r])) })
const built = await buildSubmissionWorkbook(source, [
  session('1', [result('A-001', '2026-09-01', '이전')]),
  session('2', [result('A001', '2026-09-22', '최신'), result('EXTRA', '2026-09-22', '외부')]),
  session('3', [result('A-002', '2025-09-22', '다른연도')], '2025 정기조사'),
], '2026')
const output = new ExcelJS.Workbook()
await output.xlsx.load(await built.blob.arrayBuffer())
const actual = output.getWorksheet('본부A')!
assert.equal(built.filled, 1)
assert.equal(built.unmatched, 1)
assert.equal(actual.getCell('B3').value, '기존부서')
assert.equal(actual.getCell('E3').value, '최신')
assert.equal((actual.getCell('B3').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFBDD7EE')
assert.equal(actual.getCell('B4').value, '미조사부서')
assert.equal((actual.getCell('B4').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFFFFF00')
assert.equal(actual.getCell('F3').value, '조사부서')
assert.equal(actual.getCell('G3').value, '조사자')
assert.equal(actual.getCell('C1').master.address, 'B1')
assert.equal(output.getWorksheet('안내')!.getCell('A1').value, '원본 안내문')
assert.equal(output.getWorksheet('제출 미매칭 확인')!.rowCount, 2)
assert.equal(sheet.getCell('B3').value, '기존부서')
assert.equal((await buildSubmissionWorkbook(source, [], '2026')).filled, 0)
console.log('PASS submission: latest deduplication, year isolation, blue fill, audit columns, unmatched sheet, original preservation')

assert.equal((actual.getCell('A3').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFFFFF00')
assert.notEqual((actual.getCell('A4').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFFFFF00')
assert.equal((output.worksheets[2].getCell('B2').fill as ExcelJS.FillPattern)?.fgColor?.argb, 'FFFFFF00')
console.log('PASS confirmed asset numbers highlighted without changing uninspected cells')
