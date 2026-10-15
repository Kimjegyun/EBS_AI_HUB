import { useCallback, useEffect, useId, useRef, useState } from 'react'
import './barcodePolyfill'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Icon } from '../../components/Icon'
import { createCameraFocus } from './cameraFocus'
import { extractAssetNoFromScan, isValidScannedAssetNo } from './scanText'
import { findAutofocusBackCamera, forgetCamera, hasContinuousFocus, isAndroid, rememberCamera, savedCameraId } from './cameraPick'
import { configureLabelCamera, labelVideoConstraints } from './labelCamera'
import { reserveCamera, settleCameraOperation } from './cameraLease'
import { startFrameDecoding } from './barcodeFrameDecoder'
import { ScanFeedbackBanner, type ScanFeedback } from './scanFeedback'

interface QrScannerProps {
  onResult: (text: string) => void
  onClose: () => void
  /** Result of the latest scan (kept by the caller across scanner restarts). */
  feedback?: ScanFeedback | null
  /** Reads the printed asset number (OCR) from a captured frame, for labels without codes. */
  onOcrFrame?: (frame: HTMLCanvasElement) => Promise<void>
}

/** Enlarge small labels so users can keep their distance; zoom does not fix defocus. */
const DEFAULT_ZOOM = 2
const LABEL_VIEW_RATIO = 16 / 9

const SUPPORTED_ASSET_CODE_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
]

/**
 * 자산 라벨 QR 스캐너.
 *
 * 작은 스티커를 잘 잡기 위해 네 가지를 한다.
 *   · 시작하자마자 2배 줌 (기기가 지원하는 범위로 보정)
 *   · 전체 영상을 판독하고 작은 중앙 가이드로 지나친 근접 촬영을 방지
 *   · 화면을 탭하면 그 지점으로 초점을 맞춤
 *   · 어두운 기계실을 위해 플래시 토글 (지원 기기만)
 *
 * QR 자체는 회전 불변이라 라벨이 가로든 세로든 뒤집혔든 해독된다.
 * 다만 기기가 BarcodeDetector 를 지원하면 그쪽이 기울어진 코드에 훨씬 강해서 먼저 쓴다.
 */
export default function QrScanner({ onResult, onClose, feedback, onOcrFrame }: QrScannerProps) {
  const [ocrBusy, setOcrBusy] = useState(false)
  // Full native-resolution frame: printed numbers need every pixel, and the label
  // may sit anywhere in view.
  const readPrintedNumber = async () => {
    const video = document.getElementById(idRef.current)?.querySelector('video')
    if (!onOcrFrame || !video?.videoWidth || ocrBusy) return
    const frame = document.createElement('canvas')
    frame.width = video.videoWidth
    frame.height = video.videoHeight
    frame.getContext('2d')?.drawImage(video, 0, 0)
    setOcrBusy(true)
    try { await onOcrFrame(frame) } finally { setOcrBusy(false) }
  }
  const readerId = `qr-reader-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const idRef = useRef(readerId)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onResultRef = useRef(onResult)
  const handledRef = useRef(false)
  const focusRef = useRef<ReturnType<typeof createCameraFocus> | null>(null)
  const [focusSupported, setFocusSupported] = useState(false)
  const [exposureEV, setExposureEV] = useState<number | null>(null)
  const [viewRatio, setViewRatio] = useState(LABEL_VIEW_RATIO)
  const [error, setError] = useState<string | null>(null)
  const [scanNotice, setScanNotice] = useState<string | null>(null)
  const [showDistanceHint, setShowDistanceHint] = useState(false)
  // 'starting' — Html5Qrcode.start() 호출 후, 카메라 권한 대기 중
  // 'running'  — 카메라 뷰 활성 (start() 성공)
  const [phase, setPhase] = useState<'starting' | 'running'>('starting')
  const [cameraAttempt, setCameraAttempt] = useState(0)

  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  // 탭한 자리에 잠깐 보여줄 초점 표시
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null)
  const [focusMessage, setFocusMessage] = useState<string | null>(null)
  const focusRequestRef = useRef(0)

  useEffect(() => { onResultRef.current = onResult }, [onResult])

  useEffect(() => {
    if (phase !== 'running') return
    const timer = setTimeout(() => {
      if (!handledRef.current) setShowDistanceHint(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    let cancelled = false
    // Set only by cleanup; `cancelled` is also used when switching lenses.
    let unmounted = false
    let cameraFocus: ReturnType<typeof createCameraFocus> | null = null
    let detachVideoEvents = () => {}
    let stopFrameDecoding = () => {}
    const lease = reserveCamera()
    let startPromise: Promise<unknown> | undefined
    let stopPromise: Promise<void> | undefined
    handledRef.current = false

    const scanner = new Html5Qrcode(idRef.current, {
      verbose: false,
      formatsToSupport: SUPPORTED_ASSET_CODE_FORMATS,
      // 기기에 내장된 BarcodeDetector 는 기울어지거나 작은 코드에 훨씬 강하다.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    })
    scannerRef.current = scanner

    const stop = () => {
      if (stopPromise) return stopPromise
      cameraFocus?.dispose()
      detachVideoEvents()
      stopFrameDecoding()
      stopPromise = (async () => {
        await lease.ready
        await settleCameraOperation(startPromise)
        const video = document.getElementById(idRef.current)?.querySelector('video')
        const stream = video?.srcObject
        // Release the native device even when html5-qrcode's stop promise hangs.
        if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
        try {
          if (scanner.isScanning) await settleCameraOperation(scanner.stop())
          scanner.clear()
        } catch { /* The track fallback below still releases the hardware. */ }
        finally {
          if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
          lease.release()
        }
      })()
      return stopPromise
    }

    // Shared by html5-qrcode (preview-sized canvas, reliable for QR) and the
    // native-resolution zxing-cpp worker (needed for thin 1D barcode bars).
    const handleDecoded = (decodedText: string) => {
      if (cancelled || handledRef.current) return
      const assetNo = extractAssetNoFromScan(decodedText)
      if (!isValidScannedAssetNo(assetNo)) {
        setScanNotice('자산번호를 정확히 인식하지 못했습니다. 다시 카메라로 찍으세요.')
        return
      }
      handledRef.current = true
      clearTimeout(timeoutId)
      void stop().then(() => { if (!cancelled) onResultRef.current(assetNo) })
    }

    const timeoutId = setTimeout(() => {
      if (cancelled) return
      cancelled = true
      setError(
        '카메라 영상을 받지 못했습니다. 카메라를 다시 시작해 주세요.\n' +
        '다른 앱에서 카메라를 사용 중이라면 해당 앱의 카메라를 닫아주세요.',
      )
      void stop()
    }, 10_000)

    const android = isAndroid()
    const pinnedCamera = android ? savedCameraId() : null
    const baseConstraints = labelVideoConstraints(window.matchMedia('(orientation: portrait)').matches)
    // A remembered lens replaces facingMode; both together can be overconstrained.
    const videoConstraints: MediaTrackConstraints = pinnedCamera
      ? { ...baseConstraints, facingMode: undefined, deviceId: { exact: pinnedCamera } }
      : baseConstraints

    void lease.ready.then(() => {
      if (cancelled) return
      startPromise = scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          // Decode the same central strip shown in the cropped preview.
          // Keep the video at its natural ratio so barcodes are never stretched.
          qrbox: (width, height) => ({ width, height: Math.min(height, Math.floor(width / LABEL_VIEW_RATIO)) }),
          // 좌우 반전된 화면(전면 카메라·거울 모드)도 시도한다.
          disableFlip: false,
          videoConstraints,
        },
        handleDecoded,
        () => {
          /* 프레임마다 나는 해독 실패는 정상이므로 무시 */
        },
      )
      return startPromise
    })
      .then(async () => {
        if (cancelled) {
          // Permission can resolve after the user already closed the dialog.
          const lateVideo = document.getElementById(idRef.current)?.querySelector('video')
          const lateStream = lateVideo?.srcObject
          if (lateStream instanceof MediaStream) lateStream.getTracks().forEach((track) => track.stop())
          if (scanner.isScanning) await settleCameraOperation(scanner.stop())
          await stop()
          return
        }
        const video = document.getElementById(idRef.current)?.querySelector('video')
        if (android && !pinnedCamera) {
          // First scan on this phone: make sure the lens it opened can autofocus.
          const runningTrack = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0]
          const currentId = runningTrack?.getSettings().deviceId
          let caps: MediaTrackCapabilities | undefined
          try { caps = scanner.getRunningTrackCapabilities() } catch { /* Treated as unknown below. */ }
          if (caps && !hasContinuousFocus(caps)) {
            cancelled = true
            clearTimeout(timeoutId)
            await stop()
            const better = await findAutofocusBackCamera(currentId)
            // Remember even when nothing better exists so the check runs only once.
            const chosen = better ?? currentId
            if (chosen) rememberCamera(chosen)
            if (!unmounted) setCameraAttempt((value) => value + 1)
            return
          }
          if (currentId) rememberCamera(currentId)
        }
        if (video) {
          video.playsInline = true
          video.muted = true
          video.autoplay = true
          video.setAttribute('webkit-playsinline', 'true')
          stopFrameDecoding = startFrameDecoding(video, LABEL_VIEW_RATIO, handleDecoded)
          let resuming = false
          const resume = async () => {
            if (cancelled || handledRef.current || document.hidden || resuming) return
            resuming = true
            try {
              if (video.paused) await video.play()
              const profile = await configureLabelCamera(scanner, () => !cancelled && !handledRef.current, false)
              if (!cancelled) setExposureEV(profile.exposureEV)
              await cameraFocus?.refocus()
            } catch { /* A user gesture may still be required to resume playback. */ }
            finally { resuming = false }
          }
          const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]
          document.addEventListener('visibilitychange', resume)
          track?.addEventListener('unmute', resume)
          const onPlaying = () => {
            if (!cancelled && !handledRef.current) {
              clearTimeout(timeoutId)
              setPhase('running')
            }
          }
          const updateRatio = () => {
            if (!cancelled && video.videoWidth && video.videoHeight) {
              setViewRatio(Math.max(LABEL_VIEW_RATIO, video.videoWidth / video.videoHeight))
            }
          }
          updateRatio()
          video.addEventListener('loadedmetadata', updateRatio)
          video.addEventListener('resize', updateRatio)
          video.addEventListener('playing', onPlaying)
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused) onPlaying()
          detachVideoEvents = () => {
            document.removeEventListener('visibilitychange', resume)
            track?.removeEventListener('unmute', resume)
            video.removeEventListener('loadedmetadata', updateRatio)
            video.removeEventListener('resize', updateRatio)
            video.removeEventListener('playing', onPlaying)
          }
        }

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
        // Focus setup is independent of zoom/torch support or failures.
        if (cancelled || handledRef.current) return
        const profile = await configureLabelCamera(scanner, () => !cancelled && !handledRef.current)
        if (cancelled || handledRef.current) return
        setExposureEV(profile.exposureEV)
        const focus = createCameraFocus({
          getRunningTrackCapabilities: () => scanner.getRunningTrackCapabilities(),
          applyVideoConstraints: (constraints) => scanner.applyVideoConstraints({
            ...constraints,
            advanced: (constraints.advanced ?? [{}]).map((settings) => ({ ...profile.retained, ...settings })),
          }),
        }, () => !cancelled && !handledRef.current && !document.hidden)
        cameraFocus = focus
        focusRef.current = focus
        const enabled = await focus.start()
        if (!cancelled) setFocusSupported(enabled)
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        if (cancelled) return
        if (pinnedCamera && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
          // The remembered lens is gone (reset camera permission, new phone profile).
          forgetCamera()
          cancelled = true
          void stop().then(() => { if (!unmounted) setCameraAttempt((value) => value + 1) })
          return
        }
        setError(
          err?.name === 'NotAllowedError'
            ? '카메라 권한이 거부되었습니다.\n브라우저 설정에서 카메라를 허용하세요.'
            : `카메라를 시작할 수 없습니다: ${err?.message ?? err}`,
        )
      })

    return () => {
      cancelled = true
      unmounted = true
      clearTimeout(timeoutId)
      void stop()
    }
  }, [cameraAttempt])

  const applyZoom = useCallback((next: number) => {
    setZoom(next)
    try {
      const cap = scannerRef.current?.getRunningTrackCameraCapabilities().zoomFeature()
      if (cap?.isSupported()) void cap.apply(next).then(() => focusRef.current?.refocus()).catch(() => {})
    } catch {
      /* 무시 */
    }
  }, [])

  const toggleTorch = useCallback(() => {
    try {
      const cap = scannerRef.current?.getRunningTrackCameraCapabilities().torchFeature()
      if (!cap?.isSupported()) return
      const next = !torchOn
      void cap.apply(next).then(() => setTorchOn(next)).catch(() => {})
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
    if (phase !== 'running' || !e.isPrimary) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    setFocusRing({ x: px, y: py, key: Date.now() })
    setFocusMessage('선택한 위치에 초점을 요청하고 있습니다…')
    const request = ++focusRequestRef.current

    // The natural-size video extends above/below the visible center crop.
    const video = e.currentTarget.querySelector('video')
    const videoRect = video?.getBoundingClientRect() ?? rect
    const scale = video?.videoWidth && video.videoHeight
      ? Math.min(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight) : 1
    const width = video?.videoWidth ? video.videoWidth * scale : videoRect.width
    const height = video?.videoHeight ? video.videoHeight * scale : videoRect.height
    if (!width || !height) return
    const x = Math.min(Math.max((e.clientX - videoRect.left - (videoRect.width - width) / 2) / width, 0), 1)
    const y = Math.min(Math.max((e.clientY - videoRect.top - (videoRect.height - height) / 2) / height, 0), 1)
    const focus = focusRef.current
    if (!focus) {
      setFocusMessage('카메라 준비 중입니다. 잠시 후 다시 터치해 주세요.')
      return
    }
    void focus.refocus({ x, y }).then((accepted) => {
      if (request !== focusRequestRef.current) return
      setFocusMessage(accepted
        ? '초점 위치를 요청했습니다. 라벨이 선명해질 때까지 잠시 멈춰주세요.'
        : '이 기기에서는 터치 초점을 제어할 수 없습니다. 거리를 조금 조절해 주세요.')
    })
  }, [phase])

  // 초점 표시는 잠깐만 보여준다
  useEffect(() => {
    if (!focusRing) return
    const t = setTimeout(() => { focusRequestRef.current++; setFocusRing(null); setFocusMessage(null) }, 2500)
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
            QR · 바코드 스캔
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
            <div className="space-y-3 p-4 text-center text-body-sm">
              <p className="whitespace-pre-line text-error">{error}</p>
              <button type="button" className="rounded-lg bg-primary px-4 py-2 text-on-primary"
                onClick={() => {
                  setError(null)
                  setPhase('starting')
                  setShowDistanceHint(false)
                  setCameraAttempt((value) => value + 1)
                }}>카메라 다시 시작</button>
            </div>
          ) : (
            <>
              {/* 카메라 뷰 — 탭하면 그 지점으로 초점 */}
              <div
                className="relative flex w-full min-h-0 items-center cursor-crosshair touch-manipulation overflow-hidden rounded-lg bg-black"
                style={{ aspectRatio: viewRatio }}
                onPointerDown={focusAt}
              >
                {/* Html5Qrcode 가 이 div 안에 video 를 주입한다 — 항상 렌더해야 한다 */}
                <div id={readerId} className="w-full shrink-0 [&_video]:!w-full [&_video]:!h-auto [&_video]:!max-h-none" />
                {phase === 'running' && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="aspect-[4/1] max-h-[65%] w-4/5 rounded-lg border border-dashed border-white/80" />
                  </div>
                )}

                {focusRing && (
                  <span
                    key={focusRing.key}
                    className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-yellow-300 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                    style={{ left: focusRing.x, top: focusRing.y }}
                  />
                )}
              </div>
              {scanNotice
                ? <ScanFeedbackBanner feedback={{ kind: 'failure', detail: scanNotice, key: 0 }} />
                : feedback && <ScanFeedbackBanner feedback={feedback} />}
              {onOcrFrame && phase === 'running' && (
                <button
                  type="button"
                  onClick={() => void readPrintedNumber()}
                  disabled={ocrBusy}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 py-2.5 text-body-sm font-semibold text-primary disabled:opacity-60"
                >
                  <Icon name={ocrBusy ? 'progress_activity' : 'text_fields'} className={`text-[20px] ${ocrBusy ? 'animate-spin' : ''}`} />
                  {ocrBusy ? '자산번호 글자 읽는 중…' : '코드 없는 라벨 · 번호 글자 읽기'}
                </button>
              )}
              {focusMessage && <p role="status" className="mt-2 text-center text-caption text-on-surface-variant">{focusMessage}</p>}

              {phase === 'starting' && (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-body-sm text-on-surface-variant">
                  <Icon name="progress_activity" className="animate-spin text-[24px]" />
                  <p>카메라 권한 요청 중...</p>
                  <p className="text-center text-caption">브라우저 상단의 카메라 허용 알림을 수락하세요.</p>
                </div>
              )}

              {phase === 'running' && (
                <div className="mt-2 space-y-2">
                  <p className="text-center text-caption text-on-surface-variant">
                    라벨 방향 무관 · {exposureEV !== null ? `노출 ${exposureEV.toFixed(1)} EV` : '자동 노출'} · 흰 바탕 글자 촬영
                  </p>
                  <div className="rounded-lg bg-primary/10 px-3 py-2 text-center text-body-sm text-on-surface" role="status">
                    <strong>휴대폰을 조금 떨어뜨려 촬영하세요.</strong>
                    <p className="mt-1 text-caption">라벨이 세로·거꾸로여도 읽습니다. 라벨 전체가 화면에 들어오게 하고, 흰 바탕이 반짝이면 휴대폰 각도를 조금 바꿔주세요.</p>
                    {showDistanceHint && (
                      <p className="mt-1 font-medium">계속 흐리면 천천히 뒤로 이동해 주세요. 선명해진 뒤 손을 잠시 멈춰주세요.</p>
                    )}
                  </div>
                  {focusSupported && (
                    <p className="text-center text-caption text-on-surface-variant">
                      자동 초점 사용 중 · 인식이 지연되면 자동으로 다시 맞춥니다
                    </p>
                  )}
                  {!focusSupported && <p className="text-center text-caption text-on-surface-variant">기기의 기본 초점을 사용합니다. 브라우저가 지원하는 경우에만 터치 초점·노출·확대를 적용합니다.</p>}
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
                      라벨과 적당한 거리를 두고 선명하게 보이도록 조절하세요.
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
                  {zoomRange && <p className="text-center text-caption text-on-surface-variant">라벨이 너무 작으면 가까이 가지 말고 2x·3x 확대를 사용하세요. 흐린 영상은 확대해도 선명해지지 않습니다.</p>}

                  <p className="text-center text-caption leading-relaxed text-on-surface-variant">
                    QR 또는 가로 바코드를 화면 안에 비추세요. 방향은 상관없습니다.<br />
                    흐린 글자나 바코드를 화면에서 터치하면 해당 위치로 초점을 요청합니다.
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
