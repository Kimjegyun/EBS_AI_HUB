import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Icon } from '../../components/Icon'

interface QrScannerProps {
  onResult: (text: string) => void
  onClose: () => void
}

// Live camera QR scanner. Works on PC (webcam) and mobile (rear camera) browsers
// over https/localhost. Decodes a QR and reports the text, then stops.
export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const idRef = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 'waiting'  — div 마운트 전
  // 'starting' — Html5Qrcode.start() 호출 후, 카메라 권한 대기 중
  // 'running'  — 카메라 뷰 활성 (start() 성공)
  const [phase, setPhase] = useState<'waiting' | 'starting' | 'running'>('waiting')
  const handledRef = useRef(false)

  // Step 1: div가 DOM에 들어온 직후 starting으로 전환
  useEffect(() => {
    setPhase('starting')
  }, [])

  // Step 2: starting이 되면 Html5Qrcode 초기화 (div가 확실히 DOM에 있음)
  useEffect(() => {
    if (phase !== 'starting') return

    let cancelled = false

    const scanner = new Html5Qrcode(idRef.current, { verbose: false })
    scannerRef.current = scanner

    const stop = async () => {
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch {
        /* ignore stop races */
      }
    }

    // 카메라 권한 대기 타임아웃 — 10초 안에 start()가 성공/실패 안 하면 안내
    const timeoutId = setTimeout(() => {
      if (cancelled) return
      setError(
        '카메라 응답이 없습니다.\n' +
        '• 브라우저에서 카메라 권한을 허용했는지 확인하세요.\n' +
        '• HTTPS가 아닌 경우 카메라를 사용할 수 없습니다.',
      )
    }, 10_000)

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handledRef.current) return
          handledRef.current = true
          clearTimeout(timeoutId)
          void stop().then(() => onResult(decodedText.trim()))
        },
        () => {
          /* per-frame decode errors are normal; ignore */
        },
      )
      .then(() => {
        clearTimeout(timeoutId)
        if (!cancelled) setPhase('running')
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        if (cancelled) return
        setError(
          err?.name === 'NotAllowedError'
            ? '카메라 권한이 거부되었습니다.\n브라우저 설정에서 카메라를 허용하세요.'
            : `카메라를 시작할 수 없습니다: ${err?.message ?? err}`,
        )
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      void stop()
    }
  }, [phase, onResult])

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container rounded-2xl overflow-hidden border border-outline-variant">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant">
          <span className="font-h3 text-h3 text-on-surface flex items-center gap-2">
            <Icon name="qr_code_scanner" className="text-primary" />
            QR 스캔
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="p-3">
          {error ? (
            /* 에러 상태 */
            <div className="text-error text-body-sm p-4 text-center whitespace-pre-line">{error}</div>
          ) : (
            <>
              {/* Html5Qrcode가 이 div 안에 카메라 뷰를 주입함 — 항상 렌더해야 함 */}
              <div id={idRef.current} className="w-full overflow-hidden rounded-lg" />

              {/* starting: 카메라 권한 프롬프트 대기 중 */}
              {phase === 'starting' && (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-on-surface-variant text-body-sm">
                  <Icon name="progress_activity" className="animate-spin text-[24px]" />
                  <p>카메라 권한 요청 중...</p>
                  <p className="text-caption text-center">브라우저 상단의 카메라 허용 알림을 수락하세요.</p>
                </div>
              )}

              {phase === 'running' && (
                <p className="text-center text-caption text-on-surface-variant mt-2">
                  자산 스티커의 QR을 사각형 안에 비추세요.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
