import { surveyDepartment } from './surveyDepartment'
import ExcelJS from 'exceljs'
import { formatSurveyDateTime } from './surveyDateTime'
const looseAssetKey = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
export interface SurveyResult { assetNo: string; confirmed: boolean; dept: string; location?: string; status?: string; stickerMissing?: boolean; note?: string; userDept?: string; verifier: string; verifierDept: string; surveyedAt: string;  }
export interface SurveySession { id: string; name: string; parentDept: string; createdAt: string; createdBy: string; dept: string; results: Record<string, SurveyResult> }

const cellText = (cell: ExcelJS.Cell) => cell.value == null ? '' : cell.text
const text = (cell: ExcelJS.Cell) => cellText(cell).trim().replace(/\s/g, '')
export async function buildSubmissionWorkbook(source: ArrayBuffer, sessions: SurveySession[], year: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(source)
  const latest = new Map<string, { session: SurveySession; result: SurveyResult }>()
  for (const session of [...sessions].sort((a, b) => a.id.localeCompare(b.id))) {
    const sessionYear = session.name.match(/20\d{2}/)?.[0] ?? session.createdAt.slice(0, 4)
    if (sessionYear !== year) continue
    for (const result of Object.values(session.results)) {
      const key = `${session.parentDept.trim()}:${looseAssetKey(result.assetNo)}`
      const previous = latest.get(key)
      if (!previous || result.surveyedAt > previous.result.surveyedAt) latest.set(key, { session, result })
    }
  }
  const matched = new Set<string>()
  let filled = 0
  // Locate each 본부 sheet's asset list first so results can be placed on the asset's own row.
  type Entry = { key: string; session: SurveySession; result: SurveyResult }
  const sheets = workbook.worksheets.flatMap(sheet => {
    let headerRow = 0, assetCol = 0
    for (let r = 1; r <= Math.min(sheet.rowCount, 30) && !headerRow; r++) {
      sheet.getRow(r).eachCell(cell => { if (text(cell) === '자산번호') { headerRow = r; assetCol = Number(cell.col) } })
    }
    if (!headerRow) return []
    const keys = new Set<string>()
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) keys.add(looseAssetKey(cellText(sheet.getRow(r).getCell(assetCol))))
    return [{ sheet, headerRow, assetCol, keys, byAsset: new Map<string, Entry>() }]
  })
  for (const [key, entry] of latest) {
    const asset = looseAssetKey(entry.result.assetNo)
    const home = sheets.find(info => info.sheet.name.trim() === entry.session.parentDept.trim())
    // Another 본부's inspector may confirm an asset found in their area; it still belongs on its own 본부 row.
    const target = home?.keys.has(asset) ? home : sheets.find(info => info.keys.has(asset)) ?? home
    if (!target) continue
    const existing = target.byAsset.get(asset)
    if (target.keys.has(asset)) matched.add(key)
    if (!existing || entry.result.surveyedAt > existing.result.surveyedAt) target.byAsset.set(asset, { key, ...entry })
  }
  for (const { sheet, headerRow, assetCol, byAsset } of sheets) {
    const header = sheet.getRow(headerRow)
    let currentDept = 0
    header.eachCell(cell => {
      if (text(cell) !== '설치부서') return
      for (let r = Math.max(1, headerRow - 3); r < headerRow; r++) {
        if (text(sheet.getCell(r, Number(cell.col))) === '현재') currentDept = Number(cell.col)
      }
    })
    if (!byAsset.size) continue
    if (!currentDept) throw new Error(`${sheet.name}: '현재 → 설치부서' 열을 찾지 못했습니다. 마스터 양식을 확인해 주세요.`)
    const labels = ['조사부서', '조사자', '조사일시', '확인완료']
    const columns = labels.map(label => {
      let existing = 0
      header.eachCell(cell => { if (text(cell) === label) existing = Number(cell.col) })
      const col = existing || sheet.columnCount + 1
      const cell = header.getCell(col)
      cell.value = label
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } }
      sheet.getColumn(col).width = label === '조사일시' ? 25 : 18
      return col
    })
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const found = byAsset.get(looseAssetKey(cellText(row.getCell(assetCol))))
      if (!found) continue
      const { result, session } = found
      if (!result.confirmed) continue
      row.hidden = false
      const assetCell = row.getCell(assetCol)
      assetCell.style = structuredClone(assetCell.style)
      assetCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
      const deptCell = row.getCell(currentDept)
      // Loaded XLSX cells can share style objects. Detach before changing fill.
      deptCell.style = structuredClone(deptCell.style)
      const previous = cellText(deptCell)
      const setChange = (label: string, value: string) => {
        let col = 0
        header.eachCell(cell => { if (text(cell) === label.replace(/\s/g, '')) col = Number(cell.col) })
        if (col) row.getCell(col).value = value
      }
      setChange('부서이동', result.dept.trim() !== previous.trim() ? result.dept : '')
      let locationCol = 0
      header.eachCell(cell => { if (text(cell) === '설치장소') locationCol = Number(cell.col) })
      if (locationCol) setChange('위치이동', result.location && result.location.trim() !== cellText(row.getCell(locationCol)).trim() ? result.location : '')
      setChange('사용자(부서)명변경', result.userDept || '')
      setChange('자산스티커미부착', result.stickerMissing ? '미부착' : '')
      setChange('비고', result.note || '')
      header.eachCell(cell => { if (text(cell).startsWith('부서확인')) row.getCell(Number(cell.col)).value = result.status || '정상' })
      deptCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
      deptCell.note = `마스터 설치부서: ${previous}\n조사자: ${result.verifier || session.createdBy}`
      // Strip only this sheet's 본부 prefix; a finder from another 본부 keeps it (예: '기술본부 송출부').
      const values = [surveyDepartment(result.verifierDept || session.dept, sheet.name), result.verifier || session.createdBy, formatSurveyDateTime(result.surveyedAt), '완료']
      columns.forEach((col, i) => { row.getCell(col).value = values[i] })
      filled++
    }
  }
  const unmatched = [...latest.entries()].filter(([key, entry]) => entry.result.confirmed && !matched.has(key))
  if (unmatched.length) {
    let name = '제출 미매칭 확인'
    for (let i = 2; workbook.getWorksheet(name); i++) name = `제출 미매칭 확인 ${i}`
    const sheet = workbook.addWorksheet(name)
    sheet.addRow(['본부', '자산번호', '설치부서', '조사부서', '조사자', '조사일시'])
    for (const [, { session, result }] of unmatched) {
      const row = sheet.addRow([session.parentDept, result.assetNo, result.dept, surveyDepartment(result.verifierDept || session.dept, session.parentDept), result.verifier || session.createdBy, formatSurveyDateTime(result.surveyedAt)])
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return { blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName: `${year}_운영관리부_재물조사_제출용.xlsx`, filled, unmatched: unmatched.length }
}
