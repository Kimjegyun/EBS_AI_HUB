// Data model for the 재물조사(자산 실사) app.

/** A single asset record from the master inventory list (loaded from a dataset). */
export interface Asset {
  assetNo: string // 자산번호 (QR 값)
  oldAssetNo: string // 구자산번호
  name: string // 자산명
  model: string // 모델명
  spec: string // 규격
  acquiredAt: string // 취득일자
  serialNo: string // 제조번호
  dept: string // 설치부서
  location: string // 설치장소
  userDept: string // 사용자(부서)
  team: string // 팀세부
  manageDept: string // 관리부서
  equipType: string // 장비구분
  parentDept: string // 상위부서
  // 재물조사 확인 정보 (서버 본부별 DB에서 수신)
  confirmedInSession?: string // 이번 조사에서 확인된 세션 ID
  confirmedAt?: string        // 확인 일시
  confirmedBy?: string        // 확인자
}

/**
 * ERP 이전년도 자산현황 레코드 (사용자가 로컬 업로드한 대조 파일).
 * 화면 상 자산 정보 표시용 — 서버에 저장되지 않음.
 */
export interface ErpAsset {
  assetNo: string       // 자산번호
  oldAssetNo?: string   // 구자산번호
  name?: string         // 자산명
  model?: string        // 모델명
  spec?: string         // 규격
  acquiredAt?: string   // 취득일자
  acquiredPrice?: string // 취득가액
  serialNo?: string     // 제조번호
  dept?: string         // 설치부서명
  location?: string     // 설치장소명
  userDept?: string     // 사용자(부서)명
  team?: string         // 팀세부명
  manageDept?: string   // 관리부서명
  equipType?: string    // 장비구분
  parentDept?: string   // 상위부서
  assetStatus?: string  // 자산상태
  accountType?: string  // 회계구분
  remark?: string       // 비고
}

export interface AssetDataset {
  meta: {
    id: string
    title: string
    parentDept: string
    source: string
    sheet: string
    generatedAt: string
    count: number
  }
  assets: Asset[]
}

/** Available master datasets bundled with the app (served from /datasets). */
export interface DatasetSource {
  id: string
  title: string
  url: string
  parentDept: string
}

export const DATASET_SOURCES: DatasetSource[] = [
  {
    id: 'icb-2025',
    title: '2025년 정기재물조사 리스트(방송장비)',
    url: '/datasets/assets-icb-2025.json',
    parentDept: '융합기술본부',
  },
]

/** 부서확인/이상유무 classification used during the survey. */
export const SURVEY_STATUSES = [
  '정상',
  '부서이동',
  '위치이동',
  '사용자변경',
  '소재불명',
  '불용대상',
  '반납대상',
] as const
export type SurveyStatus = (typeof SURVEY_STATUSES)[number]

/** Per-asset survey result captured during a survey session. */
export interface SurveyResult {
  assetNo: string
  // Snapshot of the (possibly edited) asset info at survey time.
  name: string // 자산명 (확인/수정)
  location: string // 설치장소 (확인/수정)
  dept: string // 설치부서
  model: string
  spec: string
  // Survey input
  status: SurveyStatus // 부서확인/이상유무
  stickerMissing: boolean // 자산스티커 미부착
  note: string // 비고
  // Audit trail
  confirmed: boolean // 확인여부
  verifier: string // 확인자
  verifierDept: string // 확인자 부서
  surveyedAt: string // 조사일 (ISO)
  matched: boolean // 마스터에서 자산번호가 조회되었는지
  photoIds?: string[] // 현물 사진 (IndexedDB photo ids)
  // Optional AI cross-check
  aiChecked?: boolean
  aiVerdict?: string
}

/** 오프라인 시 로컬에 쌓이는 미전송 동기화 큐 항목. */
export interface SyncQueueItem {
  id: string
  sessionId: string
  action: 'upsert' | 'delete'
  result?: SurveyResult
  assetNo?: string
  queuedAt: string
  retryCount: number
}

/** A survey session = one category run, e.g. "2026년 정기재물조사". */
export interface SurveySession {
  id: string
  name: string // 카테고리명
  datasetId: string
  parentDept: string
  createdAt: string
  createdBy: string
  dept: string // 조사 부서
  results: Record<string, SurveyResult> // keyed by assetNo
  completed: boolean
  completedAt?: string
  uploadedAt?: string
  // 재물조사 결과 서버 등록 완료 여부
  submittedAt?: string
}
