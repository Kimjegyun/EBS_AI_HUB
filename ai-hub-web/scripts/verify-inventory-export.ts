import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { buildErpWithInspection, INSPECTION_HEADERS } from '../src/apps/inventory/inspectionExport'
import type { ErpStore } from '../src/apps/inventory/erpLookup'
import type { SurveySession } from '../src/apps/inventory/types'

const webDir = path.resolve(import.meta.dirname, '..')
const envText = fs.readFileSync(path.join(webDir, 'server', '.env'), 'utf8')
const token = envText.match(/^INVENTORY_ACCESS_CODE=(.+)$/m)?.[1]?.trim()
if (!token) throw new Error('INVENTORY_ACCESS_CODE가 없습니다.')

const base = 'http://127.0.0.1:3001/api/inventory'
const headers = { Authorization: `Bearer ${token}` }
const datasets = await (await fetch(`${base}/datasets`, { headers })).json() as Array<{ id: string; parentDept: string }>
const dataset = datasets.find((item) => item.parentDept === '융합기술본부')
if (!dataset) throw new Error('융합기술본부 데이터셋이 없습니다.')

const assets = await (await fetch(`${base}/datasets/${dataset.id}/assets`, { headers })).json() as Array<{
  assetNo: string; dept: string; name: string; location: string; model: string; spec: string
}>
const asset = assets.find((item) => item.assetNo && item.dept)
if (!asset) throw new Error('검증할 자산이 없습니다.')

const sourceResponse = await fetch(`${base}/datasets/${dataset.id}/download`, { headers })
if (!sourceResponse.ok) throw new Error(`원본 다운로드 실패: ${sourceResponse.status}`)
const source = await sourceResponse.arrayBuffer()
const changedDept = `${asset.dept}_변경검증`
const session: SurveySession = {
  id: 'verification-only', name: '2026 재물조사 검증', datasetId: dataset.id,
  parentDept: dataset.parentDept, createdAt: new Date().toISOString(),
  createdBy: '검증사용자', dept: '검증부서', completed: true,
  results: {
    [asset.assetNo]: {
      assetNo: asset.assetNo, name: asset.name, location: asset.location, dept: changedDept,
      model: asset.model, spec: asset.spec, status: '정상', stickerMissing: false, note: '',
      confirmed: true, verifier: '검증사용자', verifierDept: '검증부서',
      surveyedAt: '2026-09-08T09:10:11.000Z', matched: true,
    },
  },
}
const store: ErpStore = {
  id: 'verification-only', fileName: 'source.xlsx', sheetName: dataset.parentDept,
  importedAt: new Date().toISOString(), assets: [], fileData: source,
}
const output = await buildErpWithInspection(store, session)
if (output.fileName !== 'ERP_검증부서_검증사용자.xlsx') throw new Error(`파일명 오류: ${output.fileName}`)

const wb = new ExcelJS.Workbook()
await wb.xlsx.load(await output.blob.arrayBuffer())
const ws = wb.getWorksheet(dataset.parentDept) ?? wb.worksheets[0]
if (!ws) throw new Error('결과 시트가 없습니다.')
const headerRowNumber = Array.from({ length: Math.min(ws.rowCount, 20) }, (_, index) => index + 1)
  .find((rowNumber) => String(ws.getRow(rowNumber).getCell(1).value) === INSPECTION_HEADERS[0])
if (!headerRowNumber) throw new Error('검수 헤더 행을 찾지 못했습니다.')
const headerRow = ws.getRow(headerRowNumber)
INSPECTION_HEADERS.forEach((header, index) => {
  if (String(headerRow.getCell(index + 1).value) !== header) throw new Error(`검수 헤더 오류: ${header}`)
})
let verified = false
ws.eachRow((row, rowNumber) => {
  if (rowNumber <= headerRowNumber || verified) return
  const values = row.values as ExcelJS.CellValue[]
  const assetCell = values.findIndex((value) => String(value ?? '').trim() === asset.assetNo)
  if (assetCell < 0) return
  const deptCell = row.getCell(assetCell + 7)
  if (String(deptCell.value) !== changedDept) throw new Error('설치부서 변경값이 반영되지 않았습니다.')
  const fill = deptCell.fill as ExcelJS.FillPattern
  if (fill.fgColor?.argb !== 'FFFFF2A8') throw new Error(`노란색 셀 오류: ${fill.fgColor?.argb}`)
  if (!String(deptCell.note ?? '').includes(asset.dept)) throw new Error('기존 설치부서 메모가 없습니다.')
  if (String(row.getCell(1).value) !== '완료') throw new Error('검수완료 값이 없습니다.')
  if (String(row.getCell(2).value) !== '검증부서') throw new Error('검수인부서 값이 없습니다.')
  if (String(row.getCell(3).value) !== '검증사용자') throw new Error('검수인 값이 없습니다.')
  if (String(row.getCell(4).value) !== '2026-09-08') throw new Error('검수날짜 값이 없습니다.')
  verified = true
})
if (!verified) throw new Error('검증 자산 행을 찾지 못했습니다.')
console.log(JSON.stringify({ ok: true, assetNo: asset.assetNo, output: output.fileName, filled: output.filled }))
