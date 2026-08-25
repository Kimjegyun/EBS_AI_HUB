import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Icon } from '../../components/Icon'

interface QrScannerProps {
  onResult: (text: string) => void
  onClose: () => void
}

/** 자산 스티커는 작아서 기본 배율로는 초점이 잘 안 맞는다. 시작할 때 이만큼 당긴다. */
const DEFAULT_ZOOM = 2

/**
 * 자산 라벨 QR 스캐너.
 *
 * 작은 스티커를 잘 잡기 위해 네 가지를 한다.
 *   · 시작하자마자 2배 줌 (기기가 지원하는 범위로 보정)
 *   · 스캔 영역을 뷰파인더의 85%까지 넓혀 QR이 비스듬하거나 치우쳐도 들어오게 함
 *   · 화면을 탭하면 그 지점으로 초점을 맞춤
 *   · 어두운 기계실을 위해 플래시 토글 (지원 기기만)
 *
 * QR 자체는 회전 불변이라 라벨이 가로든 세로든 뒤집혔든 해독된다.
 * 다만 기기가 BarcodeDetector 를 지원하면 그쪽이 기울어진 코드에 훨씬 강해서 먼저 쓴다.
 */
export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const idRef = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  // 'waiting'  — div 마운트 전
  // 'starting' — Html5Qrcode.start() 호출 후, 카메라 권한 대기 중
  // 'running'  — 카메라 뷰 활성 (start() 성공)
  const [phase, setPhase] = useState<'waiting' | 'starting' | 'running'>('waiting')

  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  // 탭한 자리에 잠깐 보여줄 초점 표시
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null)

  useEffect(() => { setPhase('starting') }, [])

  useEffect(() => {
    if (phase !== 'starting') return
    let cancelled = false

    const scanner = new Html5Qrcode(idRef.current, {
      verbose: false,
      // 기기에 내장된 BarcodeDetector 는 기울어지거나 작은 코드에 훨씬 강하다.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    })
    scannerRef.current = scanner

    const stop = async () => {
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch {
        /* 종료 경쟁 상태는 무시 */
      }
    }

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
        {
          fps: 15,
          // 스캔 영역을 넓게 잡는다. 좁은 사각형이면 라벨을 정확히 그 안에 맞춰야 해서
          // 비스듬하거나 살짝 벗어난 QR을 놓친다.
          qrbox: (viewW: number, viewH: number) => {
            const side = Math.floor(Math.min(viewW, viewH) * 0.85)
            return { width: side, height: side }
          },
          // 좌우 반전된 화면(전면 카메라·거울 모드)도 시도한다.
          disableFlip: false,
          videoConstraints: {
            facingMode: 'environment',
            // 작은 스티커는 해상도가 곧 인식률이다.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          },
        },
        (decodedText) => {
          if (handledRef.current) return
          handledRef.current = true
          clearTimeout(timeoutId)
          void stop().then(() => onResult(decodedText.trim()))
        },
        () => {
          /* 프레임마다 나는 해독 실패는 정상이므로 무시 */
        },
      )
      .then(async () => {
        clearTimeout(timeoutId)
        if (cancelled) return
        setPhase('running')

        // 카메라가 실제로 지원하는 범위 안에서 줌을 당긴다.
        try {
          const caps = scanner.getRunningTrackCameraCapabilities()
          const zoomCap = caps.zoomFeature()
          if (zoomCap.isSupported()) {
            const min = zoomCap.min()
            const max = zoomCap.max()
            const step = zoomCap.step() || 0.1
            const target = Math.min(Math.max(DEFAULT_ZOOM, min), max)
            setZoomRange({ min, max, step })
            setZoom(target)
            await zoomCap.apply(target)
          }
          setTorchSupported(caps.torchFeature().isSupported())
        } catch {
          /* 줌·플래시를 못 쓰는 기기도 스캔 자체는 된다 */
        }
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

  const applyZoom = useCallback((next: number) => {
    setZoom(next)
    try {
      const cap = scannerRef.current?.getRunningTrackCameraCapabilities().zoomFeature()
      if (cap?.isSupported()) void cap.apply(next)
    } catch {
      /* 무시 */
    }
  }, [])

  const toggleTorch = useCallback(() => {
    try {
      const cap = scannerRef.current?.getRunningTrackCameraCapabilities().torchFeature()
      if (!cap?.isSupported()) return
      const next = !torchOn
      void cap.apply(next).then(() => setTorchOn(next))
    } catch {
      /* 무시 */
    }
  }, [torchOn])

  /**
   * 탭한 지점으로 초점을 맞춘다.
   *
   * pointsOfInterest 는 표준 타입에 없어 캐스팅이 필요하다. 지원하지 않는 기기에서는
   * 조용히 실패하므로, 최소한 연속 초점을 다시 걸어 재탐색을 유도한다.
   */
  const focusAt = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'running') return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    setFocusRing({ x: px, y: py, key: Date.now() })

    const x = Math.min(Math.max(px / rect.width, 0), 1)
    const y = Math.min(Math.max(py / rect.height, 0), 1)
    const scanner = scannerRef.current
    if (!scanner) return

    scanner
      .applyVideoConstraints({
        advanced: [{
          focusMode: 'manual',
          pointsOfInterest: [{ x, y }],
        } as unknown as MediaTrackConstraintSet],
      })
      .catch(() => scanner
        .applyVideoConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        })
        .catch(() => { /* 초점 제어를 지원하지 않는 기기 */ }))
  }, [phase])

  // 초점 표시는 잠깐만 보여준다
  useEffect(() => {
    if (!focusRing) return
    const t = setTimeout(() => setFocusRing(null), 900)
    return () => clearTimeout(t)
  }, [focusRing])

  const zoomPresets = zoomRange
    ? [1, 2, 3, 5].filter((z) => z >= zoomRange.min && z <= zoomRange.max)
    : []

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-2 sm:p-4">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container">
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant px-4 py-2.5">
          <span className="font-h3 text-h3 text-on-surface flex items-center gap-2">
            <Icon name="qr_code_scanner" className="text-primary" />
            QR 스캔
          </span>
          <div className="flex items-center gap-1">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-pressed={torchOn}
                title="플래시"
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  torchOn ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <Icon name={torchOn ? 'flashlight_on' : 'flashlight_off'} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
              aria-label="닫기"
            >
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <div className="whitespace-pre-line p-4 text-center text-body-sm text-error">{error}</div>
          ) : (
            <>
              {/* 카메라 뷰 — 탭하면 그 지점으로 초점 */}
              <div
                className="relative w-full cursor-crosshair overflow-hidden rounded-lg"
                onPointerDown={focusAt}
              >
                {/* Html5Qrcode 가 이 div 안에 video 를 주입한다 — 항상 렌더해야 한다 */}
                <div id={idRef.current} className="w-full" />

                {focusRing && (
                  <span
                    key={focusRing.key}
                    className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/90 animate-ping"
                    style={{ left: focusRing.x, top: focusRing.y }}
                  />
                )}
              </div>

              {phase === 'starting' && (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-body-sm text-on-surface-variant">
                  <Icon name="progress_activity" className="animate-spin text-[24px]" />
                  <p>카메라 권한 요청 중...</p>
                  <p className="text-center text-caption">브라우저 상단의 카메라 허용 알림을 수락하세요.</p>
                </div>
              )}

              {phase === 'running' && (
                <div className="mt-2 space-y-2">
                  {/* 줌 */}
                  {zoomRange ? (
                    <div className="flex items-center gap-2">
                      <Icon name="zoom_in" className="shrink-0 text-[18px] text-on-surface-variant" />
                      <input
                        type="range"
                        min={zoomRange.min}
                        max={zoomRange.max}
                        step={zoomRange.step}
                        value={zoom}
                        onChange={(e) => applyZoom(Number(e.target.value))}
                        className="h-1 min-w-0 flex-1 accent-primary"
                        aria-label="확대"
                      />
                      <span className="w-10 shrink-0 text-right text-caption tabular-nums text-on-surface-variant">
                        {zoom.toFixed(1)}x
                      </span>
                    </div>
                  ) : (
                    <p className="text-center text-caption text-on-surface-variant">
                      이 기기는 확대를 지원하지 않습니다. 라벨에 더 가까이 대세요.
                    </p>
                  )}

                  {zoomPresets.length > 1 && (
                    <div className="flex justify-center gap-1.5">
                      {zoomPresets.map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => applyZoom(z)}
                          className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                            Math.abs(zoom - z) < 0.05
                              ? 'bg-primary text-on-primary'
                              : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          {z}x
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-center text-caption leading-relaxed text-on-surface-variant">
                    라벨을 화면 안에 비추세요. 방향은 상관없습니다.<br />
                    <strong className="text-on-surface">흐리면 화면을 탭</strong>해 초점을 맞추세요.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
