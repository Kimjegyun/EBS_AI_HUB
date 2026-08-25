// 검수 결과 엑셀 산출물 2종.
//
//  ① 검수 반영 ERP 본부 파일 — 사용자가 올린 원본 ERP 파일 맨 앞에 검수 4열
//     (검수완료 / 검수인부서 / 검수인 / 검수날짜)을 끼워 넣고 조사 결과로 채웁니다.
//     원본 서식·열은 그대로 두고 앞에만 덧붙이므로 ERP 담당자가 그대로 활용할 수 있습니다.
//
//  ② 운영관리부 대조 파일 — 운영관리부 재물조사 양식의 설치부서 셀을 ERP 설치부서와
//     자산별로 대조해, 이전과 같으면 노란색 / 바뀌었으면 주황색으로 칠합니다.
//
// SheetJS 커뮤니티 버전은 셀 채우기 색을 쓰지 못하므로 이 모듈만 exceljs를 씁니다.

import ExcelJS from 'exceljs'
import { looseAssetKey, normalizeAssetNo } from './datasetService'
import type { ErpStore } from './erpLookup'
import type { ErpAsset, SurveyResult, SurveySession } from './types'

export const INSPECTION_HEADERS = ['검수완료', '검수인부서', '검수인', '검수날짜'] as const

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 설치부서가 이전과 같음 */
const FILL_SAME = 'FFFFF2A8'
/** 설치부서가 바뀜 */
const FILL_CHANGED = 'FFFFC08A'
/** 검수 열 머리글 */
const FILL_HEADER = 'FFEDE7FF'

// ── 공통 유틸 ────────────────────────────────────────────────────────────────

/** 수식·리치텍스트·날짜 등 어떤 셀 값이든 사람이 읽는 문자열로 바꿉니다. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: string }
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim()
    if (v.result !== undefined && v.result !== null) return String(v.result).trim()
    if (v.text !== undefined) return String(v.text).trim()
    return ''
  }
  return String(value).trim()
}

function solidFill(argb: string): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

/** 헤더 행(= 자산번호 셀이 있는 첫 행)과 그 안의 열 위치를 찾습니다. */
function findHeader(ws: ExcelJS.Worksheet, extraCols: string[] = []): {
  headerRow: number
  assetNoCol: number
  extra: Record<string, number>
} {
  const maxScan = Math.min(ws.rowCount, 30)
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r)
    let assetNoCol = 0
    const extra: Record<string, number> = {}
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const text = cellText(cell.value).replace(/\s/g, '')
      if (!assetNoCol && text === '자산번호') assetNoCol = col
      for (const name of extraCols) {
        if (extra[name] === undefined && text.includes(name)) extra[name] = col
      }
    })
    if (assetNoCol) return { headerRow: r, assetNoCol, extra }
  }
  throw new Error('자산번호 헤더를 찾을 수 없습니다.')
}

/** 조사 결과를 정확 키 + 하이픈 무시 키로 색인합니다. */
function indexResults(session: SurveySession): Map<string, SurveyResult> {
  const map = new Map<string, SurveyResult>()
  const put = (key: string, r: SurveyResult) => { if (key && !map.has(key)) map.set(key, r) }
  for (const r of Object.values(session.results)) put(normalizeAssetNo(r.assetNo), r)
  for (const r of Object.values(session.results)) put(looseAssetKey(r.assetNo), r)
  return map
}

/** ERP 자산을 정확 키 + 하이픈 무시 키로 색인합니다. */
function indexErp(assets: ErpAsset[]): Map<string, ErpAsset> {
  const map = new Map<string, ErpAsset>()
  const put = (key: string, a: ErpAsset) => { if (key && !map.has(key)) map.set(key, a) }
  for (const a of assets) put(normalizeAssetNo(a.assetNo), a)
  for (const a of assets) put(looseAssetKey(a.assetNo), a)
  return map
}

function pick<T>(map: Map<string, T>, assetNo: string): T | undefined {
  return map.get(normalizeAssetNo(assetNo)) ?? map.get(looseAssetKey(assetNo))
}

async function toBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

// ── ① 검수 반영 ERP 본부 파일 ────────────────────────────────────────────────

export interface ErpInspectionResult {
  blob: Blob
  fileName: string
  /** 검수 결과가 채워진 행 수 */
  filled: number
  /** 시트의 자산 행 수 */
  total: number
}

export async function buildErpWithInspection(
  erp: ErpStore,
  session: SurveySession,
): Promise<ErpInspectionResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(erp.fileData)
  const ws = wb.getWorksheet(erp.sheetName) ?? wb.worksheets[0]
  if (!ws) throw new Error('ERP 파일에서 시트를 찾을 수 없습니다.')

  const { headerRow, assetNoCol } = findHeader(ws)

  // 맨 앞에 빈 4열 삽입 → 기존 열은 모두 4칸 오른쪽으로 밀립니다.
  const blankColumn = () => new Array<null>(ws.rowCount).fill(null)
  ws.spliceColumns(1, 0, ...INSPECTION_HEADERS.map(blankColumn))
  const shiftedAssetNoCol = assetNoCol + INSPECTION_HEADERS.length

  const header = ws.getRow(headerRow)
  INSPECTION_HEADERS.forEach((label, i) => {
    const cell = header.getCell(i + 1)
    cell.value = label
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = solidFill(FILL_HEADER)
  })
  header.commit()
  const widths = [10, 16, 12, 14]
  widths.forEach((width, i) => { ws.getColumn(i + 1).width = width })

  const results = indexResults(session)
  let filled = 0
  let total = 0
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const assetNo = cellText(row.getCell(shiftedAssetNoCol).value)
    if (!assetNo) continue
    total++
    const result = pick(results, assetNo)
    if (!result) continue
    row.getCell(1).value = result.confirmed ? '완료' : '미완료'
    row.getCell(2).value = result.verifierDept ?? ''
    row.getCell(3).value = result.verifier ?? ''
    row.getCell(4).value = result.surveyedAt ? result.surveyedAt.slice(0, 10) : ''
    row.commit()
    filled++
  }

  return {
    blob: await toBlob(wb),
    fileName: `${baseName(erp.fileName)}_검수반영_${session.parentDept}.xlsx`,
    filled,
    total,
  }
}

// ── ② 운영관리부 대조 파일 (설치부서 노랑/주황) ──────────────────────────────

export interface DeptComparisonResult {
  blob: Blob
  fileName: string
  /** 설치부서가 이전과 같음 (노랑) */
  same: number
  /** 설치부서가 바뀜 (주황) */
  changed: number
  /** ERP에 없어 대조하지 못한 자산 */
  unmatched: number
}

export async function buildDeptComparison(
  surveyFileData: ArrayBuffer,
  erp: ErpStore,
  session: SurveySession,
): Promise<DeptComparisonResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(surveyFileData)

  // 본부 시트 우선, 없으면 안내성 시트를 뺀 첫 시트
  const target =
    wb.worksheets.find((w) => w.name.trim() === session.parentDept) ??
    wb.worksheets.find((w) => w.name.includes(session.parentDept)) ??
    wb.worksheets.find((w) => !/^(전사|목차|안내|작성방법)$/i.test(w.name.trim())) ??
    wb.worksheets[0]
  if (!target) throw new Error('운영관리부 양식에서 시트를 찾을 수 없습니다.')

  const { headerRow, assetNoCol, extra } = findHeader(target, ['설치부서'])
  const deptCol = extra['설치부서']
  if (!deptCol) throw new Error(`${target.name} 시트에서 설치부서 열을 찾을 수 없습니다.`)

  const erpIndex = indexErp(erp.assets)
  let same = 0
  let changed = 0
  let unmatched = 0

  for (let r = headerRow + 1; r <= target.rowCount; r++) {
    const row = target.getRow(r)
    const assetNo = cellText(row.getCell(assetNoCol).value)
    if (!assetNo) continue
    const erpAsset = pick(erpIndex, assetNo)
    if (!erpAsset) { unmatched++; continue }

    const surveyDept = cellText(row.getCell(deptCol).value)
    const erpDept = (erpAsset.dept ?? '').trim()
    const cell = row.getCell(deptCol)
    if (surveyDept === erpDept) {
      cell.fill = solidFill(FILL_SAME)
      same++
    } else {
      cell.fill = solidFill(FILL_CHANGED)
      // 바뀐 셀에는 ERP 값을 메모로 남겨 무엇에서 무엇으로 바뀌었는지 보이게 합니다.
      cell.note = `ERP 설치부서: ${erpDept || '(없음)'}`
      changed++
    }
    row.commit()
  }

  const year = session.name.match(/(20\d{2})/)?.[1] ?? String(new Date().getFullYear())
  return {
    blob: await toBlob(wb),
    fileName: `${year}_운영관리부_설치부서대조_${session.parentDept}.xlsx`,
    same,
    changed,
    unmatched,
  }
}
