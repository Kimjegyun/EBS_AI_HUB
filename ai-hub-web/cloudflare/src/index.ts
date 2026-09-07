import * as XLSX from 'xlsx'

interface Env {
  DB: D1Database
  FILES: R2Bucket
  API_TOKEN: string
  ALLOWED_ORIGINS: string
}

type Json = Record<string, unknown>
const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim())
  return {
    'access-control-allow-origin': allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] || origin,
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    vary: 'Origin',
  }
}

function authorized(req: Request, env: Env): boolean {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || new URL(req.url).searchParams.get('token')
  return !!env.API_TOKEN && token === env.API_TOKEN
}

function rowValue(row: Json, ...labels: string[]): string {
  for (const label of labels) {
    const value = row[label]
    if (value !== undefined && value !== null) return String(value).trim()
  }
  return ''
}

function worksheetRows(buffer: ArrayBuffer, sheet?: string, headerRow = 1): Json[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[sheet && wb.Sheets[sheet] ? sheet : wb.SheetNames[0]]
  const ref = ws['!ref'] || 'A1'
  const range = XLSX.utils.decode_range(ref)
  range.s.r = Math.max(0, headerRow - 1)
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, range }) as Json[]
}

function toAsset(row: Json, parentDept: string) {
  return {
    assetNo: rowValue(row, '자산번호', '물품번호'),
    oldAssetNo: rowValue(row, '구자산번호'),
    name: rowValue(row, '자산명', '물품명'),
    model: rowValue(row, '모델명'),
    spec: rowValue(row, '규격'),
    acquiredAt: rowValue(row, '취득일자'),
    acquiredPrice: rowValue(row, '취득가액'),
    serialNo: rowValue(row, '제조번호', '시리얼번호'),
    dept: rowValue(row, '설치부서명', '설치부서'),
    location: rowValue(row, '설치장소명', '설치장소'),
    userDept: rowValue(row, '사용자부서명', '사용자부서'),
    team: rowValue(row, '팀명', '팀'),
    manageDept: rowValue(row, '관리부서명', '관리부서'),
    equipType: rowValue(row, '장비구분'),
    parentDept,
    assetStatus: rowValue(row, '자산상태'),
    accountType: rowValue(row, '회계구분'),
    remark: rowValue(row, '비고'),
  }
}

async function storeFile(env: Env, file: File, kind: string, extra: Json = {}) {
  const id = uid()
  const key = `${kind}/${id}/${encodeURIComponent(file.name)}`
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } })
  const createdAt = now()
  await env.DB.prepare(`INSERT INTO inventory_files
    (id,kind,object_key,file_name,content_type,size,parent_dept,dataset_id,session_id,sheet_names_json,summary,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, kind, key, file.name, file.type || 'application/octet-stream', file.size,
      extra.parentDept || '', extra.datasetId || null, extra.sessionId || null,
      JSON.stringify(extra.sheetNames || []), extra.summary || null, extra.createdBy || 'admin', createdAt,
    ).run()
  return { id, key, fileName: file.name, size: file.size, uploadedBy: extra.createdBy || 'admin', uploadedAt: createdAt }
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/inventory/, '')
  const method = req.method

  if (url.pathname === '/health') return json({ ok: true, service: 'ebs-inventory-cloud', time: now() })
  if (method === 'OPTIONS') return new Response(null, { status: 204 })
  if (!authorized(req, env)) return json({ error: '인증 정보가 올바르지 않습니다.' }, 401)

  if (path === '/datasets' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,title,parent_dept,asset_count,source,uploaded_at FROM datasets ORDER BY uploaded_at DESC').all()
    return json(results.map((r: any) => ({ id: r.id, title: r.title, parentDept: r.parent_dept, assetCount: r.asset_count, source: r.source, uploadedAt: r.uploaded_at })))
  }

  let match = path.match(/^\/datasets\/([^/]+)\/assets$/)
  if (match && method === 'GET') {
    const row = await env.DB.prepare('SELECT assets_json FROM datasets WHERE id=?').bind(decodeURIComponent(match[1])).first<any>()
    return row ? json(JSON.parse(row.assets_json)) : json({ error: '데이터셋을 찾을 수 없습니다.' }, 404)
  }

  if (path === '/datasets/survey-form' && method === 'POST') {
    const form = await req.formData(); const file = form.get('survey_list')
    if (!(file instanceof File)) return json({ error: '운영관리부 Excel 파일이 없습니다.' }, 400)
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const saved = await storeFile(env, file, 'operations-master', { sheetNames: wb.SheetNames })
    return json({ ...saved, sheetNames: wb.SheetNames }, 201)
  }
  if (path === '/datasets/survey-form' && method === 'GET') {
    const r = await env.DB.prepare("SELECT * FROM inventory_files WHERE kind='operations-master' ORDER BY created_at DESC LIMIT 1").first<any>()
    return json(r ? { id: r.id, fileName: r.file_name, sheetNames: JSON.parse(r.sheet_names_json), size: r.size, uploadedBy: r.created_by, uploadedAt: r.created_at } : null)
  }
  match = path.match(/^\/datasets\/survey-form\/([^/]+)$/)
  if (match && method === 'DELETE') {
    const r = await env.DB.prepare('SELECT object_key FROM inventory_files WHERE id=?').bind(match[1]).first<any>()
    if (r) await env.FILES.delete(r.object_key)
    await env.DB.prepare('DELETE FROM inventory_files WHERE id=?').bind(match[1]).run()
    return json({ ok: true })
  }

  if (path === '/datasets/upload-survey' && method === 'POST') {
    const form = await req.formData(); const file = form.get('survey_list')
    if (!(file instanceof File)) return json({ error: '운영관리부 Excel 파일이 없습니다.' }, 400)
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const saved = await storeFile(env, file, 'operations-upload', { sheetNames: wb.SheetNames })
    return json({ uploadId: saved.id, fileName: file.name, sheetNames: wb.SheetNames }, 201)
  }

  if (path === '/datasets/merge-by-id' && method === 'POST') {
    const form = await req.formData(); const erp = form.get('erp_assets')
    if (!(erp instanceof File)) return json({ error: 'ERP Excel 파일이 없습니다.' }, 400)
    const uploadId = String(form.get('uploadId') || '')
    const sheetName = String(form.get('sheetName') || '')
    const title = String(form.get('title') || sheetName)
    const datasetId = String(form.get('id') || uid())
    const masterMeta = await env.DB.prepare('SELECT object_key FROM inventory_files WHERE id=?').bind(uploadId).first<any>()
    if (!masterMeta) return json({ error: '운영관리부 원본을 찾을 수 없습니다.' }, 404)
    const masterObj = await env.FILES.get(masterMeta.object_key)
    if (!masterObj) return json({ error: '운영관리부 원본 파일이 없습니다.' }, 410)
    const surveyRows = worksheetRows(await masterObj.arrayBuffer(), sheetName, 7)
    const erpRows = worksheetRows(await erp.arrayBuffer(), undefined, 1)
    const survey = surveyRows.map((r) => toAsset(r, sheetName)).filter((a) => a.assetNo)
    const erpAssets = erpRows.map((r) => toAsset(r, sheetName)).filter((a) => a.assetNo)
    const byNo = new Map(survey.map((a) => [a.assetNo.replace(/[-\s]/g, ''), a]))
    let merged = 0; let erpOnly = 0
    for (const a of erpAssets) {
      const key = a.assetNo.replace(/[-\s]/g, '')
      const prior = byNo.get(key)
      if (prior) { byNo.set(key, { ...prior, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== '')) }); merged++ }
      else { byNo.set(key, a); erpOnly++ }
    }
    const assets = [...byNo.values()]
    const erpSaved = await storeFile(env, erp, 'erp-source', { parentDept: sheetName, datasetId })
    await env.DB.prepare(`INSERT INTO datasets(id,title,parent_dept,asset_count,assets_json,source,erp_file_id,uploaded_by,uploaded_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,parent_dept=excluded.parent_dept,
      asset_count=excluded.asset_count,assets_json=excluded.assets_json,source=excluded.source,erp_file_id=excluded.erp_file_id,uploaded_at=excluded.uploaded_at`)
      .bind(datasetId, title, sheetName, assets.length, JSON.stringify(assets), erp.name, erpSaved.id, 'admin', now()).run()
    return json({ id: datasetId, assetCount: assets.length, stats: { total: assets.length, merged, surveyOnly: survey.length - merged, erpOnly } }, 201)
  }

  if (path === '/datasets/erp-file' && method === 'GET') {
    const dept = url.searchParams.get('parentDept')
    const sql = `SELECT id,file_name,size,parent_dept,dataset_id,created_by,created_at FROM inventory_files WHERE kind='erp-source'${dept ? ' AND parent_dept=?' : ''} ORDER BY created_at DESC`
    const stmt = dept ? env.DB.prepare(sql).bind(dept) : env.DB.prepare(sql)
    const { results } = await stmt.all<any>()
    const mapped = results.map((r) => ({ id: r.id, fileName: r.file_name, size: r.size, parentDept: r.parent_dept, datasetId: r.dataset_id, uploadedBy: r.created_by, uploadedAt: r.created_at }))
    return json(dept ? mapped[0] || null : mapped)
  }

  match = path.match(/^\/datasets\/erp-file\/([^/]+)\/download$/)
  if (match && method === 'GET') return downloadFile(env, match[1])

  if (path === '/sessions' && method === 'POST') {
    const body = await req.json<Json>(); const id = uid(); const ts = now()
    await env.DB.prepare('INSERT INTO sessions(id,name,dataset_id,parent_dept,dept,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, body.name, body.datasetId, body.parentDept, body.dept || '', String(body.createdBy || 'mobile-user'), ts, ts).run()
    return json({ id, name: body.name, datasetId: body.datasetId, parentDept: body.parentDept, dept: body.dept || '', createdBy: body.createdBy || 'mobile-user', createdAt: ts, completed: false, results: {} }, 201)
  }
  if (path === '/sessions' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all<any>()
    return json(results.map(sessionDto))
  }
  match = path.match(/^\/sessions\/([^/]+)$/)
  if (match && method === 'GET') {
    const s = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(match[1]).first<any>()
    if (!s) return json({ error: '조사 회차를 찾을 수 없습니다.' }, 404)
    const { results } = await env.DB.prepare('SELECT asset_no,result_json FROM survey_results WHERE session_id=?').bind(match[1]).all<any>()
    return json({ ...sessionDto(s), results: Object.fromEntries(results.map((r) => [r.asset_no, JSON.parse(r.result_json)])) })
  }
  if (match && method === 'DELETE') {
    await env.DB.batch([env.DB.prepare('DELETE FROM survey_results WHERE session_id=?').bind(match[1]), env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(match[1])])
    return json({ ok: true })
  }

  match = path.match(/^\/sessions\/([^/]+)\/results\/([^/]+)$/)
  if (match && method === 'PUT') {
    const sessionId = match[1], assetNo = decodeURIComponent(match[2]); const result = await req.json<any>(); const ts = now()
    const session = await env.DB.prepare('SELECT dataset_id FROM sessions WHERE id=?').bind(sessionId).first<any>()
    if (!session) return json({ error: '조사 회차를 찾을 수 없습니다.' }, 404)
    const existing = await env.DB.prepare('SELECT id,verifier,result_json FROM survey_results WHERE dataset_id=? AND asset_no=? ORDER BY surveyed_at LIMIT 1').bind(session.dataset_id, assetNo).first<any>()
    if (existing && existing.verifier !== String(result.verifier || '')) {
      await env.DB.prepare('INSERT INTO result_conflicts(id,dataset_id,asset_no,winning_result_id,duplicate_result_json,duplicate_verifier,reason,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(uid(), session.dataset_id, assetNo, existing.id, JSON.stringify(result), String(result.verifier || ''), '다른 사용자가 이미 조사한 자산', ts).run()
      return json({ ok: true, duplicate: true, conflict: true, updatedAt: ts }, 202)
    }
    const id = existing?.id || uid()
    await env.DB.prepare(`INSERT INTO survey_results(id,session_id,dataset_id,asset_no,verifier,verifier_dept,result_json,surveyed_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,asset_no) DO UPDATE SET result_json=excluded.result_json,verifier=excluded.verifier,verifier_dept=excluded.verifier_dept,updated_at=excluded.updated_at`)
      .bind(id, sessionId, session.dataset_id, assetNo, result.verifier || '', result.verifierDept || '', JSON.stringify(result), result.surveyedAt || ts, ts).run()
    await env.DB.prepare('UPDATE sessions SET updated_at=? WHERE id=?').bind(ts, sessionId).run()
    return json({ ok: true, duplicate: false, updatedAt: ts })
  }
  if (match && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM survey_results WHERE session_id=? AND asset_no=?').bind(match[1], decodeURIComponent(match[2])).run()
    return json({ ok: true })
  }

  match = path.match(/^\/sessions\/([^/]+)\/results\/([^/]+)\/photo$/)
  if (match && method === 'POST') {
    const session = await env.DB.prepare('SELECT dataset_id,parent_dept FROM sessions WHERE id=?').bind(match[1]).first<any>()
    if (!session) return json({ error: '조사 회차를 찾을 수 없습니다.' }, 404)
    const form = await req.formData(); const file = form.get('file')
    if (!(file instanceof File)) return json({ error: '사진 파일이 없습니다.' }, 400)
    if (!file.type.startsWith('image/')) return json({ error: '이미지 파일만 등록할 수 있습니다.' }, 415)
    const saved = await storeFile(env, file, 'survey-photo', {
      parentDept: session.parent_dept,
      datasetId: session.dataset_id,
      sessionId: match[1],
      summary: `asset:${decodeURIComponent(match[2])}`,
      createdBy: 'mobile-user',
    })
    return json(saved, 201)
  }

  match = path.match(/^\/sessions\/([^/]+)\/complete$/)
  if (match && method === 'PUT') {
    const body = await req.json<any>(); const ts = now()
    await env.DB.prepare('UPDATE sessions SET completed=?,completed_at=?,updated_at=? WHERE id=?').bind(body.completed ? 1 : 0, body.completed ? ts : null, ts, match[1]).run()
    const generated = body.completed ? await generateFinalFiles(env, match[1]) : []
    return json({ ok: true, generated })
  }

  if (path === '/conflicts' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM result_conflicts ORDER BY created_at DESC').all()
    return json({ conflicts: results })
  }

  if (path === '/files' && method === 'POST') {
    const form = await req.formData(); const file = form.get('file')
    if (!(file instanceof File)) return json({ error: '파일이 없습니다.' }, 400)
    const saved = await storeFile(env, file, String(form.get('kind') || 'result'), { parentDept: String(form.get('parentDept') || ''), sessionId: String(form.get('sessionId') || ''), summary: String(form.get('summary') || '') })
    return json(saved, 201)
  }
  if (path === '/files' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM inventory_files ORDER BY created_at DESC').all<any>()
    return json(results.map((r) => ({ id: r.id, kind: r.kind, parentDept: r.parent_dept, sessionId: r.session_id, fileName: r.file_name, size: r.size, summary: r.summary, createdBy: r.created_by, createdAt: r.created_at })))
  }
  match = path.match(/^\/files\/([^/]+)\/download$/)
  if (match && method === 'GET') return downloadFile(env, match[1])

  return json({ error: '지원하지 않는 API입니다.', path, method }, 404)
}

function sessionDto(r: any) {
  return { id: r.id, name: r.name, datasetId: r.dataset_id, parentDept: r.parent_dept, dept: r.dept, createdBy: r.created_by, createdAt: r.created_at, completed: !!r.completed, completedAt: r.completed_at, updatedAt: r.updated_at }
}

async function downloadFile(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM inventory_files WHERE id=?').bind(id).first<any>()
  if (!row) return json({ error: '파일을 찾을 수 없습니다.' }, 404)
  const object = await env.FILES.get(row.object_key)
  if (!object) return json({ error: '파일 본문을 찾을 수 없습니다.' }, 410)
  return new Response(object.body, { headers: { 'content-type': row.content_type, 'content-length': String(row.size), 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}` } })
}

function findAssetColumn(rows: unknown[][]): { row: number; col: number } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const col = rows[r].findIndex((v) => ['자산번호', '물품번호'].includes(String(v).trim()))
    if (col >= 0) return { row: r, col }
  }
  return null
}

async function workbookFromStored(env: Env, fileId: string): Promise<XLSX.WorkBook | null> {
  const meta = await env.DB.prepare('SELECT object_key FROM inventory_files WHERE id=?').bind(fileId).first<any>()
  if (!meta) return null
  const object = await env.FILES.get(meta.object_key)
  return object ? XLSX.read(await object.arrayBuffer(), { type: 'array', cellDates: true }) : null
}

async function saveWorkbook(env: Env, wb: XLSX.WorkBook, fileName: string, kind: string, session: any, summary: string) {
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const file = new File([bytes], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return storeFile(env, file, kind, { parentDept: session.parent_dept, datasetId: session.dataset_id, sessionId: session.id, summary, createdBy: 'system' })
}

/** Generate both required admin deliverables immediately after final submission. */
async function generateFinalFiles(env: Env, sessionId: string) {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(sessionId).first<any>()
  if (!session) return []
  const dataset = await env.DB.prepare('SELECT erp_file_id FROM datasets WHERE id=?').bind(session.dataset_id).first<any>()
  const { results } = await env.DB.prepare('SELECT asset_no,result_json FROM survey_results WHERE dataset_id=?').bind(session.dataset_id).all<any>()
  const byAsset = new Map(results.map((r) => [String(r.asset_no).replace(/[-\s]/g, ''), JSON.parse(r.result_json)]))
  const generated: Array<{ id: string; fileName: string }> = []

  if (dataset?.erp_file_id) {
    const wb = await workbookFromStored(env, dataset.erp_file_id)
    if (wb) {
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      const pos = findAssetColumn(rows)
      if (pos) {
        const output = rows.map((row, index) => {
          if (index === pos.row) return ['검수완료', '검수인부서', '검수인', '검수날짜', ...row]
          if (index < pos.row) return ['', '', '', '', ...row]
          const r: any = byAsset.get(String(row[pos.col] || '').replace(/[-\s]/g, ''))
          return [r ? '완료' : '', r?.verifierDept || '', r?.verifier || '', r?.surveyedAt || '', ...row]
        })
        wb.Sheets[wb.SheetNames[0]] = XLSX.utils.aoa_to_sheet(output)
        const saved = await saveWorkbook(env, wb, `${session.parent_dept}_ERP_재물조사결과.xlsx`, 'erp-inspection', session, `조사 ${byAsset.size}건 반영`)
        generated.push({ id: saved.id, fileName: saved.fileName })
      }
    }
  }

  const operations = await env.DB.prepare("SELECT id FROM inventory_files WHERE kind='operations-master' ORDER BY created_at DESC LIMIT 1").first<any>()
  if (operations) {
    const wb = await workbookFromStored(env, operations.id)
    if (wb) {
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '' })
        const pos = findAssetColumn(rows); if (!pos) continue
        const output = rows.map((row, index) => {
          if (index === pos.row) return ['조사여부', '이상여부', '조사부서', '조사자', ...row]
          if (index < pos.row) return ['', '', '', '', ...row]
          const r: any = byAsset.get(String(row[pos.col] || '').replace(/[-\s]/g, ''))
          const abnormal = r && (r.status !== '정상' || r.stickerMissing) ? (r.status || '스티커 미부착') : ''
          return [r ? '완료' : '미조사', abnormal, r?.verifierDept || '', r?.verifier || '', ...row]
        })
        wb.Sheets[name] = XLSX.utils.aoa_to_sheet(output)
      }
      const saved = await saveWorkbook(env, wb, `운영관리부_재물조사_최종결과.xlsx`, 'operations-final', session, `조사 ${byAsset.size}건 및 이상여부 반영`)
      generated.push({ id: saved.id, fileName: saved.fileName })
    }
  }
  return generated
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(req, env)
    try {
      const response = await route(req, env)
      Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v))
      return response
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : '서버 처리 오류' }, 500, headers)
    }
  },
}
