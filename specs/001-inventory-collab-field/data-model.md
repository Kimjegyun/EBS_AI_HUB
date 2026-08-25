# Data Model: 재물조사 협업

## 서버 DB 스키마 (SQLite 추가 테이블)

### inventory_datasets
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | 데이터셋 ID (예: icb-2025) |
| title | TEXT NOT NULL | 표시명 |
| parent_dept | TEXT NOT NULL | 상위부서 |
| asset_count | INTEGER | 자산 수 |
| assets_json | TEXT NOT NULL | 자산 배열 JSON |
| uploaded_by | TEXT | 업로드한 사용자 ID |
| uploaded_at | DATETIME | 업로드 시각 |
| source | TEXT | 원본 파일명 |

### inventory_sessions
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | 세션 ID |
| name | TEXT NOT NULL | 세션명 |
| dataset_id | TEXT NOT NULL | 데이터셋 ID |
| parent_dept | TEXT NOT NULL | 상위부서 |
| dept | TEXT | 조사 부서 |
| created_by | TEXT NOT NULL | 생성자 |
| created_at | DATETIME | 생성 시각 |
| completed | INTEGER DEFAULT 0 | 완료 여부 (0/1) |
| completed_at | DATETIME | 완료 시각 |
| uploaded_at | DATETIME | 업로드 시각 |
| results_json | TEXT DEFAULT '{}' | 조사 결과 JSON (Record<assetNo, SurveyResult>) |
| updated_at | DATETIME | 마지막 수정 시각 (SSE 폴링 기준) |

### inventory_sync_log
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 로그 ID |
| session_id | TEXT NOT NULL | 세션 ID |
| asset_no | TEXT NOT NULL | 자산번호 |
| action | TEXT | upsert / delete |
| user_id | TEXT | 수행 사용자 |
| synced_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 동기화 시각 |

## 클라이언트 타입 추가 (types.ts)

```typescript
/** 오프라인 시 로컬에 쌓이는 미전송 동기화 큐 항목 */
export interface SyncQueueItem {
  id: string           // 고유 큐 항목 ID
  sessionId: string    // 대상 세션 ID
  action: 'upsert' | 'delete'
  result?: SurveyResult
  assetNo?: string     // delete 시 사용
  queuedAt: string     // ISO 타임스탬프
  retryCount: number   // 재시도 횟수
}
```
