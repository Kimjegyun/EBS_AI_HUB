// Export utilities for 재물조사 (재물조사 결과 엑셀 생성)
//
// 파일 구조:
//   파일③  본부별 결과 파일 — 세션의 조사 결과를 본부 자산 현황에 매핑해 생성
//           (운영관리부 양식과 동일한 열 구조 + 조사 결과 열 추가)
//
//   전사 병합  파일①(운영관리부 전체 양식)에 해당 본부 조사 결과를 덮어쓴 파일 생성
//             (관리자가 최종 제출용)

import * as XLSX from 'xlsx'
import type { Asset, ErpAsset } from './types'
import type { SurveySession, SurveyResult } from './types'

// ── ERP 파일 파싱 (사용자 로컬 업로드) ───────────────────────────────────────

/** ERP 자산현황 xlsx → ErpAsset[] (헤더행 자동 탐색, 컬럼명 유연 매핑) */
export function parseErpFile(buffer: ArrayBuffer): { assets: ErpAsset[]; sheetName: string } {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')

  // 헤더행 탐색: '자산번호' 셀이 있는 첫 번째 행
  let headerRow = 0
  let assetNoCol = -1
  for (let r = range.s.r; r <= Math.min(range.s.r + 20, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell?.v && String(cell.v).trim() === '자산번호') {
        headerRow = r
        assetNoCol = c
        break
      }
    }
    if (assetNoCol >= 0) break
  }

  if (assetNoCol < 0) throw new Error('ERP 파일에서 "자산번호" 헤더를 찾을 수 없습니다.')

  // 헤더 행 컬럼 인덱스 수집
  const colMap: Record<string, number> = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })]
    if (cell?.v) colMap[String(cell.v).trim()] = c
  }

  const getVal = (row: number, col: number): string => {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })]
    return cell?.v !== undefined && cell.v !== null ? String(cell.v).trim() : ''
  }

  const col = (name: string) => colMap[name] ?? -1

  const assets: ErpAsset[] = []
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const assetNo = getVal(r, assetNoCol)
    if (!assetNo || assetNo === '자산번호') continue
    assets.push({
      assetNo,
      oldAssetNo:    col('구자산번호') >= 0   ? getVal(r, col('구자산번호'))   : undefined,
      name:          col('자산명') >= 0        ? getVal(r, col('자산명'))        : undefined,
      model:         col('모델명') >= 0        ? getVal(r, col('모델명'))        : undefined,
      spec:          col('규격') >= 0          ? getVal(r, col('규격'))          : undefined,
      acquiredAt:    col('취득일자') >= 0      ? getVal(r, col('취득일자'))      : undefined,
      acquiredPrice: col('취득가액') >= 0      ? getVal(r, col('취득가액'))      : undefined,
      serialNo:      col('제조번호') >= 0      ? getVal(r, col('제조번호'))      : undefined,
      // 설치부서명 우선, 없으면 설치부서
      dept: col('설치부서명') >= 0 ? getVal(r, col('설치부서명'))
           : col('설치부서') >= 0  ? getVal(r, col('설치부서')) : undefined,
      // 설치장소명 우선
      location: col('설치장소명') >= 0 ? getVal(r, col('설치장소명'))
              : col('설치장소') >= 0   ? getVal(r, col('설치장소')) : undefined,
      userDept: col('사용자(부서)명') >= 0 ? getVal(r, col('사용자(부서)명'))
             : col('사용자(부서)') >= 0   ? getVal(r, col('사용자(부서)')) : undefined,
      team:       col('팀세부명') >= 0   ? getVal(r, col('팀세부명'))   : col('팀세부') >= 0 ? getVal(r, col('팀세부')) : undefined,
      manageDept: col('관리부서명') >= 0 ? getVal(r, col('관리부서명')) : col('관리부서') >= 0 ? getVal(r, col('관리부서')) : undefined,
      equipType:  col('장비구분') >= 0   ? getVal(r, col('장비구분'))   : undefined,
      parentDept: col('상위부서') >= 0   ? getVal(r, col('상위부서'))   : undefined,
      assetStatus: col('자산상태') >= 0  ? getVal(r, col('자산상태'))  : undefined,
      accountType: col('회계구분') >= 0  ? getVal(r, col('회계구분'))  : undefined,
      remark:     col('비고') >= 0       ? getVal(r, col('비고'))       : undefined,
    })
  }
  return { assets, sheetName }
}

/**
 * 운영관리부 배포 양식(전사 xlsx)의 특정 본부 시트를 파싱.
 * 자산번호 → 행번호 인덱스와 조사 결과 열 위치를 반환.
 */
export interface SurveySheetIndex {
  wb: XLSX.WorkBook
  sheetName: string
  headerRow: number
  assetNoCol: number
  surveyStatusCol: number  // 부서확인 열 (-1이면 없음)
  remarkCol: number        // 비고 열 (-1이면 없음)
  assetRowIndex: Map<string, number>
}

export function parseSurveySheet(buffer: ArrayBuffer, targetSheet?: string): SurveySheetIndex {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheetName =
    (targetSheet ? wb.SheetNames.find((n) => n === targetSheet || n.includes(targetSheet)) : undefined)
    ?? wb.SheetNames.find((n) => !/^(전사|목차|안내|작성방법)$/i.test(n.trim()))
    ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')

  let headerRow = -1
  let assetNoCol = -1
  let surveyStatusCol = -1
  let remarkCol = -1

  for (let r = range.s.r; r <= Math.min(range.s.r + 20, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      const v = cell?.v ? String(cell.v).trim() : ''
      if (v === '자산번호') { headerRow = r; assetNoCol = c }
      if (headerRow === r && v.replace(/\s/g, '').includes('부서확인')) surveyStatusCol = c
      if (headerRow === r && v.replace(/\s/g, '').includes('비고')) remarkCol = c
    }
    if (headerRow >= 0) break
  }

  if (headerRow < 0 || assetNoCol < 0) {
    throw new Error(`"${sheetName}" 시트에서 자산번호 헤더를 찾을 수 없습니다.`)
  }

  const assetRowIndex = new Map<string, number>()
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: assetNoCol })]
    const no = cell?.v ? String(cell.v).trim() : ''
    if (no) assetRowIndex.set(no, r)
  }

  return { wb, sheetName, headerRow, assetNoCol, surveyStatusCol, remarkCol, assetRowIndex }
}

// ── 공통 열 정의 ──────────────────────────────────────────────────────────────

const RESULT_HEADER = [
  'No.',
  '자산번호', '구자산번호', '자산명', '모델명', '규격', '취득일자', '제조번호',
  '설치부서', '설치장소', '사용자(부서)', '팀세부', '관리부서', '장비구분', '상위부서',
  // 조사 결과 열
  '부서확인\n(이상유무)', '자산스티커\n미부착', '비고', '사진 수',
  // 확인자 정보
  '확인자', '확인자 부서', '조사일',
]

const RESULT_COL_WIDTHS = [5, 18, 15, 22, 18, 15, 12, 15, 16, 16, 14, 12, 14, 12, 14, 14, 8, 20, 6, 10, 10, 18]

function sessionYear(session: SurveySession): string {
  const m = session.name.match(/(20\d{2})/)
  return m?.[1] ?? String(new Date(session.createdAt).getFullYear())
}

// ── 파일③: 본부별 조사 결과 엑셀 ─────────────────────────────────────────────

/**
 * 세션 결과를 자산 마스터(assets)와 매핑해 본부별 조사 결과 xlsx 생성.
 * assets가 없으면 세션 results 만으로 생성 (마스터 미연결).
 */
export function buildDivisionResultWorkbook(
  session: SurveySession,
  assets: Asset[],
): XLSX.WorkBook {
  const year = sessionYear(session)
  const titleRow = [`${year}년 정기재물조사 결과 — ${session.parentDept}`]
  const metaRow = [
    `조사부서: ${session.dept || '-'}`,
    `확인자: ${session.createdBy}`,
    `생성일: ${new Date().toLocaleString('ko-KR')}`,
    `총 ${assets.length}건`,
  ]

  // 자산 마스터 인덱스
  const assetMap = new Map(assets.map((a) => [a.assetNo, a]))

  // 세션 결과 중 이 본부에 해당하는 것만 (dept 기준)
  const results = Object.values(session.results).sort((a, b) => a.assetNo.localeCompare(b.assetNo))

  // 자산 마스터 기준으로 행 생성 (마스터에 없는 자산은 뒤에 추가)
  const masterRows: (string | number)[][] = []
  // 마스터 자산 전체 출력 (조사된 것은 결과 포함, 미조사는 빈 칸)
  assets.forEach((a, idx) => {
    const r = session.results[a.assetNo]
    masterRows.push(buildRow(idx + 1, a, r))
  })

  // 마스터 미등록 자산 (조사됐지만 마스터에 없는 것)
  const extraResults = results.filter((r) => !assetMap.has(r.assetNo))
  extraResults.forEach((r, idx) => {
    masterRows.push(buildRowFromResult(assets.length + idx + 1, r))
  })

  const aoa = [titleRow, metaRow, [], RESULT_HEADER, ...masterRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = RESULT_COL_WIDTHS.map((w) => ({ wch: w }))
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: RESULT_HEADER.length - 1 } }]

  const wb = XLSX.utils.book_new()
  const sheetName = session.parentDept.slice(0, 31) || '조사결과'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return wb
}

function buildRow(no: number, asset: Asset, result?: SurveyResult): (string | number)[] {
  return [
    no,
    asset.assetNo, asset.oldAssetNo ?? '', asset.name, asset.model ?? '', asset.spec ?? '',
    asset.acquiredAt ?? '', asset.serialNo ?? '',
    asset.dept, asset.location, asset.userDept ?? '', asset.team ?? '',
    asset.manageDept ?? '', asset.equipType ?? '', asset.parentDept ?? '',
    // 조사 결과
    result?.status ?? '',
    result?.stickerMissing ? '미부착' : '',
    result?.note ?? '',
    result?.photoIds?.length ?? 0,
    result?.verifier ?? '',
    (result as (SurveyResult & { verifierDept?: string }) | undefined)?.verifierDept ?? '',
    result?.surveyedAt ? new Date(result.surveyedAt).toLocaleString('ko-KR') : '',
  ]
}

function buildRowFromResult(no: number, r: SurveyResult): (string | number)[] {
  return [
    no,
    r.assetNo, '', r.name, r.model ?? '', r.spec ?? '',
    '', '',
    r.dept, r.location, '', '', '', '', '',
    r.status,
    r.stickerMissing ? '미부착' : '',
    r.note ?? '',
    r.photoIds?.length ?? 0,
    r.verifier ?? '',
    (r as SurveyResult & { verifierDept?: string }).verifierDept ?? '',
    r.surveyedAt ? new Date(r.surveyedAt).toLocaleString('ko-KR') : '',
  ]
}

export function exportDivisionResultFileName(session: SurveySession): string {
  const year = sessionYear(session)
  return `${year}_재물조사결과_${session.parentDept}_${session.dept || '전체'}.xlsx`
}

/** 파일③ 다운로드 */
export function downloadDivisionResult(session: SurveySession, assets: Asset[]): string {
  const wb = buildDivisionResultWorkbook(session, assets)
  const name = exportDivisionResultFileName(session)
  XLSX.writeFile(wb, name)
  return name
}

// ── 전사 병합: 파일① 운영관리부 전체 양식에 본부 결과 덮어쓰기 ─────────────────

/**
 * 운영관리부 원본 전체 양식 파일(surveyFileBuffer)의 해당 본부 시트에
 * 세션 조사 결과를 반영한 뒤 전체 파일로 반환.
 *
 * 처리 방식:
 *  1. 원본 파일의 해당 본부 시트를 읽어 자산번호 기준 행 위치 파악
 *  2. 조사 결과 열(부서확인, 비고)에 값 채움
 *  3. 전체 workbook 을 Blob 으로 반환
 */
/**
 * 운영관리부 배포 전체 양식의 해당 본부 시트에 세션 조사 결과를 병합.
 * parseSurveySheet()로 시트 구조 파악 후 결과를 인라인으로 채운다.
 *
 * 반영 항목:
 *  - 부서확인(이상유무) 열
 *  - 비고 열
 * 나머지 자산 기본 정보는 원본 유지.
 */
export function buildMergedSurveyWorkbook(
  surveyFileBuffer: ArrayBuffer,
  session: SurveySession,
): { wb: XLSX.WorkBook; sheetName: string; filled: number; notFound: number } {
  const idx = parseSurveySheet(surveyFileBuffer, session.parentDept)
  const ws = idx.wb.Sheets[idx.sheetName]

  let filled = 0
  let notFound = 0

  for (const result of Object.values(session.results)) {
    const rowIdx = idx.assetRowIndex.get(result.assetNo)
    if (rowIdx === undefined) { notFound++; continue }

    if (idx.surveyStatusCol >= 0) {
      ws[XLSX.utils.encode_cell({ r: rowIdx, c: idx.surveyStatusCol })] = { v: result.status, t: 's' }
    }
    if (idx.remarkCol >= 0) {
      // 비고: 이상유무 비고 + 확인자(부서) 표기
      const noteVal = [
        result.note,
        result.verifier ? `확인: ${result.verifier}${result.verifierDept ? `(${result.verifierDept})` : ''}` : '',
      ].filter(Boolean).join(' / ')
      ws[XLSX.utils.encode_cell({ r: rowIdx, c: idx.remarkCol })] = { v: noteVal, t: 's' }
    }
    filled++
  }

  return { wb: idx.wb, sheetName: idx.sheetName, filled, notFound }
}

export function downloadMergedSurveyFile(
  wb: XLSX.WorkBook,
  session: SurveySession,
): string {
  const year = sessionYear(session)
  const name = `${year}_운영관리부양식_병합완료_${session.parentDept}.xlsx`
  XLSX.writeFile(wb, name)
  return name
}

// ── 하위호환: 기존 세션 단일 엑셀 내보내기 ──────────────────────────────────

const EXPORT_HEADER = [
  'No.', '자산번호', '자산명', '모델명', '규격', '취득일자', '제조번호',
  '설치부서', '설치장소', '관리부서', '장비구분', '상위부서',
  '이상유무(부서확인)', '자산스티커미부착', '비고', '사진',
  '확인여부', '확인자', '확인자 부서', '조사일',
]

export function buildExportRows(session: SurveySession): (string | number)[][] {
  const results = Object.values(session.results).sort((a, b) => a.assetNo.localeCompare(b.assetNo))
  return results.map((r, i) => [
    i + 1,
    r.assetNo, r.name, r.model, r.spec,
    '', '',
    r.dept, r.location, '', '', session.parentDept,
    r.status,
    r.stickerMissing ? '미부착' : '',
    r.note,
    (r.photoIds?.length ?? 0) > 0 ? `${r.photoIds!.length}장` : '',
    r.confirmed ? '확인' : '미확인',
    r.verifier,
    (r as SurveyResult & { verifierDept?: string }).verifierDept ?? '',
    r.surveyedAt ? new Date(r.surveyedAt).toLocaleString('ko-KR') : '',
  ])
}

export function buildWorkbook(session: SurveySession): XLSX.WorkBook {
  const title = [`${sessionYear(session)}년 정기재물조사 - ${session.name}`]
  const meta = [
    `상위부서: ${session.parentDept}`,
    `조사부서: ${session.dept || '-'}`,
    `작성자: ${session.createdBy}`,
    `생성일: ${new Date(session.createdAt).toLocaleString('ko-KR')}`,
  ]
  const aoa = [title, meta, [], EXPORT_HEADER, ...buildExportRows(session)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = EXPORT_HEADER.map((h) => ({ wch: Math.max(10, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '재물조사결과')
  return wb
}

export function exportFileName(session: SurveySession): string {
  const year = sessionYear(session)
  const safe = session.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
  return `${year}_정기재물조사_${session.parentDept}_${safe}.xlsx`
}

/** 세션 기본 엑셀 내보내기 */
export function downloadSessionExcel(session: SurveySession): string {
  const wb = buildWorkbook(session)
  const name = exportFileName(session)
  XLSX.writeFile(wb, name)
  return name
}
