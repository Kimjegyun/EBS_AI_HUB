import type { WorkBook } from 'xlsx'
import { authHeaders, describeAuthStatus } from './authHeaders'
import type { ResourcePolicy } from '../../server/src/lib/resourcePolicy'
import { heavyMobileWork, isMobileDevice, workbookExpandedSize } from './mobileResources'

export type { ResourcePolicy }
async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/resources${path}`, { ...init, signal: init?.signal ?? AbortSignal.timeout(path === '/workbook' ? 90_000 : 15_000), headers: authHeaders(init?.headers as Record<string, string> | undefined) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(describeAuthStatus(response.status) ?? body?.error ?? `자원 설정 요청 실패 (${response.status})`)
  return body
}
export async function fetchResourcePolicy(): Promise<ResourcePolicy> {
  const body = await request('')
  if (!body?.policy || !['central', 'user'].includes(body.policy.audioMode) || !['central', 'user'].includes(body.policy.workbookMode)) throw new Error('처리 위치 설정을 읽지 못했습니다.')
  return { ...body.policy, mobileHeavyToServer: body.policy.mobileHeavyToServer !== false }
}
export async function saveResourcePolicy(policy: ResourcePolicy): Promise<ResourcePolicy> {
  return (await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }) })).policy
}
export async function fetchResourceStatus(): Promise<{ policy: ResourcePolicy; active: number }> { return request('/status') }

export function readWorkbookLocally(buffer: ArrayBuffer): Promise<WorkBook> {
  if (buffer.byteLength > 20 * 1024 * 1024) return Promise.reject(new Error('엑셀 파일은 20MB 이하여야 합니다.'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/workbook.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => { finish(); reject(new Error('사용자 PC 엑셀 처리 제한 시간(15초)을 초과했습니다.')) }, 15000)
    worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error(data.error)); else resolve(data.workbook) }
    worker.onerror = () => { finish(); reject(new Error('사용자 PC에서 엑셀을 처리하지 못했습니다.')) }
    // Preserve the original for existing IndexedDB storage and formatted exports.
    const copy = buffer.slice(0)
    worker.postMessage(copy, [copy])
  })
}

export async function readWorkbookByPolicy(buffer: ArrayBuffer): Promise<WorkBook> {
  const policy = await fetchResourcePolicy()
  const mobileCentral = policy.workbookMode === 'user' && policy.mobileHeavyToServer && isMobileDevice()
    && heavyMobileWork('workbook', buffer.byteLength, undefined, workbookExpandedSize(buffer))
  if (policy.workbookMode === 'user' && !mobileCentral) return readWorkbookLocally(buffer)
  const form = new FormData()
  form.append('file', new Blob([buffer]), 'workbook.xlsx')
  return (await request('/workbook', { method: 'POST', body: form, headers: mobileCentral ? { 'X-AIHub-Execution': 'mobile-central' } : undefined })).workbook
}
