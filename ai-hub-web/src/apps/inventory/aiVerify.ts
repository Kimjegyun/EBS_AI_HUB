// Optional AI cross-check: compares the master asset record with what the
// surveyor entered for the physical item and returns a short verdict. Uses the
// shared OpenAI integration (configured in 설정). No key → graceful message.

import { isAiConfigured } from '../../lib/aiSettings'
import { chatComplete } from '../../lib/openaiClient'
import type { Asset, SurveyResult } from './types'

const APP_ID = 'inventory'

export interface AiVerifyResult {
  ok: boolean
  verdict: string
}

export function aiAvailable(): boolean {
  return isAiConfigured(APP_ID)
}

export async function aiVerifyAsset(asset: Asset | undefined, entered: SurveyResult): Promise<AiVerifyResult> {
  if (!isAiConfigured(APP_ID)) {
    return { ok: false, verdict: 'AI가 설정되지 않았습니다. 설정에서 OpenAI API 키를 입력하세요.' }
  }
  const loaded = asset
    ? `자산명:${asset.name} / 모델:${asset.model || '-'} / 규격:${asset.spec || '-'} / 설치부서:${asset.dept} / 설치장소:${asset.location}`
    : '(마스터에서 조회되지 않은 자산번호)'
  const observed = `자산명:${entered.name} / 모델:${entered.model || '-'} / 규격:${entered.spec || '-'} / 설치부서:${entered.dept} / 설치장소:${entered.location} / 상태:${entered.status} / 스티커미부착:${entered.stickerMissing ? '예' : '아니오'} / 비고:${entered.note || '-'}`

  const res = await chatComplete([
    {
      role: 'system',
      content:
        '너는 자산 실사(재물조사) 검증 도우미다. 장부(로딩) 정보와 현물(입력) 정보를 비교해서, ' +
        '일치 여부를 판단하고 불일치 항목과 권장 조치를 아주 짧게 한국어로 알려줘. ' +
        '출력 형식: "판정: 일치|불일치 — 사유" 한 줄. 과장 없이 사실만.',
    },
    { role: 'user', content: `장부 정보: ${loaded}\n현물 정보: ${observed}` },
  ], { appId: APP_ID })
  if (!res.ok) return { ok: false, verdict: res.error }
  return { ok: true, verdict: res.content.trim() }
}
