# REST API 계약: Inventory

Base path: `/api/inventory`
Auth: `Authorization: Bearer <jwt>` (모든 엔드포인트)

## Datasets

### GET /api/inventory/datasets
서버에 저장된 데이터셋 목록 반환 (assets_json 제외).

**Response 200**
```json
[
  { "id": "icb-2025", "title": "2025년 정기재물조사 리스트(방송장비)", "parentDept": "융합기술본부", "assetCount": 1200, "uploadedAt": "2025-07-30T00:00:00Z" }
]
```

### GET /api/inventory/datasets/:id/assets
특정 데이터셋의 자산 배열 반환 (메모리 캐시 → DB).

**Response 200**: `Asset[]`

### POST /api/inventory/datasets (admin only)
엑셀 파일 업로드 → 파싱 → 저장.

**Request**: `multipart/form-data` — `file` (xlsx), `title` (string), `parentDept` (string), `id` (string, optional)
**Response 201**: `{ id, title, assetCount }`
**Error 400**: 필수 컬럼 누락 시 `{ error, missingColumns: string[] }`

---

## Sessions

### GET /api/inventory/sessions
전체 세션 목록 (results_json 제외).

**Response 200**: `SessionSummary[]`

### GET /api/inventory/sessions/:id
세션 상세 (results_json 포함).

**Response 200**: `SurveySession`

### POST /api/inventory/sessions
새 세션 생성.

**Request**: `{ name, datasetId, parentDept, dept }`
**Response 201**: `SurveySession`

### PUT /api/inventory/sessions/:id/results/:assetNo
단일 자산 조사 결과 upsert.

**Request**: `SurveyResult`
**Response 200**: `{ updatedAt }`

### DELETE /api/inventory/sessions/:id/results/:assetNo
단일 자산 조사 결과 삭제.

**Response 200**: `{ ok: true }`

### PUT /api/inventory/sessions/:id/complete
세션 완료/완료취소.

**Request**: `{ completed: boolean }`
**Response 200**: `{ ok: true }`

### DELETE /api/inventory/sessions/:id
세션 삭제.

**Response 200**: `{ ok: true }`

---

## Stats (admin only)

### GET /api/inventory/stats
전체 세션 통계 집계.

**Response 200**:
```json
{
  "sessions": [
    { "id": "...", "name": "...", "dept": "...", "parentDept": "...", "total": 120, "confirmed": 100, "abnormal": 5, "completed": true, "createdAt": "..." }
  ]
}
```

---

## SSE

### GET /api/inventory/sessions/:id/events
세션 변경 이벤트 스트림 (SSE).

**Headers**: `Accept: text/event-stream`
**Events**:
- `result_updated` — `{ assetNo, updatedAt }` (결과 저장/수정)
- `result_deleted` — `{ assetNo }` (결과 삭제)
- `session_completed` — `{ completed }` (완료 상태 변경)
- `heartbeat` — 30초 간격 keepalive
