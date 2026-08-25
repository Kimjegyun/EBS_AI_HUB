// Convert the provided 재물조사 Excel into a compact JSON dataset bundled with the
// app. Run: node scripts/build-asset-dataset.mjs "<path-to-xlsx>"
//
// Source sheet: "융합기술본부" (2025년 정기재물조사 리스트). Header rows 1-6,
// data starts at sheet row 7 (0-based index 6). Column layout (0-based):
//   1 자산번호, 2 구자산번호, 3 자산명, 4 모델명, 5 규격, 6 취득일자,
//   7 제조번호, 8 설치부서, 9 설치장소, 10 사용자(부서), 11 팀세부,
//   12 관리부서, 13 부서확인, 18 장비구분, 19 상위부서, 20 비고
import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcPath = process.argv[2]
if (!srcPath) {
  console.error('Usage: node scripts/build-asset-dataset.mjs "<path-to-xlsx>"')
  process.exit(1)
}

const SHEET = '융합기술본부'
const wb = XLSX.read(readFileSync(srcPath), { type: 'buffer' })
const ws = wb.Sheets[SHEET]
if (!ws) {
  console.error('Sheet not found:', SHEET, '— available:', wb.SheetNames)
  process.exit(1)
}

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
const clean = (v) => (v == null ? '' : String(v).trim())

const assets = []
for (let i = 6; i < rows.length; i++) {
  const r = rows[i]
  const assetNo = clean(r[1])
  if (!assetNo || !/[A-Za-z0-9]/.test(assetNo)) continue
  assets.push({
    assetNo,
    oldAssetNo: clean(r[2]),
    name: clean(r[3]),
    model: clean(r[4]),
    spec: clean(r[5]),
    acquiredAt: clean(r[6]),
    serialNo: clean(r[7]),
    dept: clean(r[8]), // 설치부서
    location: clean(r[9]), // 설치장소
    userDept: clean(r[10]),
    team: clean(r[11]),
    manageDept: clean(r[12]),
    equipType: clean(r[18]), // 장비구분
    parentDept: clean(r[19]), // 상위부서
  })
}

const out = {
  meta: {
    id: 'icb-2025',
    title: '2025년 정기재물조사 리스트(방송장비)',
    parentDept: '융합기술본부',
    source: '2025년도_재물조사_리스트(방송장비)_융합기술본부.xlsx',
    sheet: SHEET,
    generatedAt: new Date().toISOString(),
    count: assets.length,
  },
  assets,
}

const outPath = resolve(__dirname, '../public/datasets/assets-icb-2025.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(out))
console.log('Wrote', outPath, '—', assets.length, 'assets')
