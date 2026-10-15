import { surveyDepartment } from '../../../server/src/services/surveyDepartment'
import type { SurveyResult } from './types'
import { formatSurveyDateTime } from '../../../server/src/services/surveyDateTime'
export async function buildResultExport(rows: (SurveyResult & { parentDept: string })[], dept: string, person: string, headquarters = '') {
  const selected = rows.filter(row => (!headquarters || row.parentDept === headquarters) && (!dept || surveyDepartment(row.verifierDept, row.parentDept) === dept) && (!person || row.verifier === person))
  if (!selected.length) throw new Error('선택 조건에 해당하는 서버 반영 결과가 없습니다.')
  const { default: ExcelJS } = await import('exceljs')
  const book = new ExcelJS.Workbook()
  const groups = new Map<string, typeof selected>()
  for (const row of selected) {
    const group = row.parentDept?.trim() || '본부 미지정'
    const items = groups.get(group) ?? []
    items.push(row)
    groups.set(group, items)
  }
  const usedNames = new Set<string>()
  for (const [group, items] of groups) {
    const base = group.replace(/[\\/*?:\[\]\x00-\x1f]/g, '_').replace(/^'+|'+$/g, '') || '본부 미지정'
    let name = base.slice(0, 31).replace(/'+$/g, '')
    for (let i = 2; usedNames.has(name.toLowerCase()); i++) {
      const suffix = ` (${i})`
      name = base.slice(0, 31 - suffix.length) + suffix
    }
    usedNames.add(name.toLowerCase())
    const sheet = book.addWorksheet(name)
    sheet.addRow(['본부', '조사부서', '입력자', '자산번호', '자산명', '설치부서', '설치장소', '모델', '규격', '상태', '비고', '조사일시'])
    for (const row of items) {
      let installationDept = row.dept?.trim() || ''
      const prefix = row.parentDept?.trim()
      if (prefix && installationDept.startsWith(prefix)) {
        const remainder = installationDept.slice(prefix.length)
        if (/^[\s/>]/.test(remainder)) installationDept = remainder.replace(/^[\s/>]+/, '')
      }
      const exported = sheet.addRow([row.parentDept, surveyDepartment(row.verifierDept, row.parentDept), row.verifier, row.assetNo, row.name, installationDept, row.location, row.model, row.spec, row.status, row.note, formatSurveyDateTime(row.surveyedAt)])
      if (row.confirmed) exported.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    }
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.columns.forEach(column => { column.width = 22 })
    sheet.autoFilter = { from: 'A1', to: `L${items.length + 1}` }
  }

  return { buffer: await book.xlsx.writeBuffer() as ArrayBuffer, count: selected.length }
}
