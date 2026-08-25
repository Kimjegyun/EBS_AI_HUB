// 모바일 기기 페어링 페이지
// 흐름: 이름/부서 입력 → 서버에서 6자리 코드 수령 → PC 관리자 허브에서 코드 입력 → 승인

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { requestPairCode } from './inventoryApiClient'

type Step = 'form' | 'code' | 'approved'

export default function PairPage() {
  const [step, setStep] = useState<Step>('form')
  const [deviceName, setDeviceName] = useState('')
  const [userName, setUserName] = useState('')
  const [department, setDepartment] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 기기 이름 자동 감지
  useEffect(() => {
    const ua = navigator.userAgent
    if (/Android/i.test(ua)) setDeviceName('Android 기기')
    else if (/iPhone|iPad/i.test(ua)) setDeviceName('iPhone/iPad')
    else setDeviceName('모바일 기기')
  }, [])

  const handleRequest = async () => {
    if (!userName.trim()) { setError('이름을 입력하세요.'); return }
    setLoading(true)
    setError('')
    const res = await requestPairCode({ deviceName, userName: userName.trim(), department: department.trim() })
    setLoading(false)
    if (!res.ok) { setError(res.error ?? '서버 연결 실패'); return }
    setPairCode(res.pairCode!)
    setStep('code')
    // 승인 상태 폴링 (10초 간격)
    pollRef.current = setInterval(async () => {
      try {
        const r = await requestPairCode({ deviceName, userName: userName.trim(), department: department.trim() })
        if (r.status === 'approved') {
          clearInterval(pollRef.current!)
          setStep('approved')
        }
      } catch { /* ignore */ }
    }, 10_000)
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-low p-6 shadow-sm space-y-5">

        {/* 헤더 */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Icon name="smartphone" className="text-primary text-[32px]" />
          </div>
          <h2 className="text-h2 font-bold text-on-surface">기기 페어링</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">재물조사 앱과 기기를 연동합니다</p>
        </div>

        {/* Step 1: 입력 폼 */}
        {step === 'form' && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-caption text-on-surface-variant">기기 이름</span>
              <input
                className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-body outline-none focus:border-primary"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="예: 홍길동 스마트폰"
              />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">
                담당자 이름 <span className="text-error">*</span>
              </span>
              <input
                className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-body outline-none focus:border-primary"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleRequest()}
                placeholder="예: 홍길동"
              />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">부서</span>
              <input
                className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-body outline-none focus:border-primary"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleRequest()}
                placeholder="예: 융합기술본부"
              />
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-error/10 border border-error/30 px-3 py-2 text-caption text-error">
                <Icon name="error" className="text-[15px] shrink-0" />
                {error}
              </div>
            )}

            <button
              type="button"
              className="w-full rounded-xl bg-primary text-on-primary py-3 text-body font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
              onClick={() => void handleRequest()}
              disabled={loading}
            >
              {loading
                ? <><Icon name="progress_activity" className="animate-spin text-[18px]" />처리 중...</>
                : <><Icon name="key" className="text-[18px]" />페어링 코드 받기</>
              }
            </button>

            {/* 도움말 */}
            <div className="rounded-xl bg-surface-container p-3 space-y-1 text-[11px] text-on-surface-variant">
              <p className="font-semibold">💡 처음 사용하시나요?</p>
              <p>1. 이름과 부서를 입력하고 코드를 받으세요</p>
              <p>2. PC 관리자에게 6자리 코드를 알려주세요</p>
              <p>3. 승인되면 자산 QR 스캔을 시작할 수 있습니다</p>
            </div>
          </div>
        )}

        {/* Step 2: 코드 표시 */}
        {step === 'code' && (
          <div className="text-center space-y-4">
            <p className="text-body-sm text-on-surface-variant">
              아래 코드를 PC 관리자에게 전달하세요.<br />
              관리자가 승인하면 자동으로 연결됩니다.
            </p>
            <div className="rounded-2xl bg-primary/8 border border-primary/20 p-6">
              <div className="text-5xl font-mono font-bold tracking-[0.25em] text-primary">
                {pairCode.slice(0, 3)} {pairCode.slice(3)}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-caption text-on-surface-variant">
              <Icon name="progress_activity" className="animate-spin text-[16px]" />
              승인 대기 중...
            </div>
            <button
              type="button"
              className="text-body-sm text-on-surface-variant underline"
              onClick={() => { clearInterval(pollRef.current!); setStep('form') }}
            >
              다시 요청
            </button>
          </div>
        )}

        {/* Step 3: 승인 완료 */}
        {step === 'approved' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto">
              <Icon name="check_circle" className="text-success text-[36px]" />
            </div>
            <div>
              <h3 className="text-h3 font-bold text-success">페어링 완료!</h3>
              <p className="text-body-sm text-on-surface-variant mt-1">
                기기가 성공적으로 등록됐습니다.<br />
                이제 재물조사 앱을 사용할 수 있습니다.
              </p>
            </div>
            <a
              href="/inventory"
              className="block w-full rounded-xl bg-primary text-on-primary py-3 text-body font-semibold hover:bg-primary/90 text-center"
            >
              재물조사 시작하기
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
