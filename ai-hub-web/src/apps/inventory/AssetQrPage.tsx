// QR 스캔 → 클립보드 복사 + QR 이미지 생성 페이지
// 일반 카메라 앱으로 자산 QR을 스캔하면 /asset/:assetNo 로 이동 →
// 자산번호가 클립보드에 자동 복사되고, QR 이미지를 저장/공유할 수 있음

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

interface AssetQrPageProps {
  assetNo: string
}

type CopyState = 'idle' | 'copying' | 'copied' | 'error'

export default function AssetQrPage({ assetNo }: AssetQrPageProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [assetInfo, setAssetInfo] = useState<{ name?: string; dept?: string; location?: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrReady, setQrReady] = useState(false)

  // 자동 클립보드 복사 (페이지 진입 즉시)
  useEffect(() => {
    if (!assetNo) return
    setCopyState('copying')
    copyToClipboard(assetNo)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('error'))
  }, [assetNo])

  // QR 코드 이미지 생성
  useEffect(() => {
    if (!assetNo || !canvasRef.current) return
    const url = `${window.location.origin}/asset/${encodeURIComponent(assetNo)}`
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(() => setQrReady(true))
      .catch(console.error)
  }, [assetNo])

  // 자산 정보 조회 시도 (서버 연결 있을 때)
  useEffect(() => {
    if (!assetNo) return
    // 로컬 IndexedDB에서 자산 정보 조회
    import('./datasetService').then(async ({ lookupAsset, normalizeAssetNo }) => {
      try {
        const normalized = normalizeAssetNo(assetNo)
        const asset = lookupAsset('', normalized)
        if (asset) {
          setAssetInfo({ name: asset.name, dept: asset.dept, location: asset.location })
        }
      } catch { /* 조회 실패 무시 */ }
    }).catch(() => {})
  }, [assetNo])

  const copyToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // fallback for older browsers / non-HTTPS
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (!ok) throw new Error('복사 실패')
    }
  }

  const handleManualCopy = () => {
    setCopyState('copying')
    copyToClipboard(assetNo)
      .then(() => { setCopyState('copied'); setTimeout(() => setCopyState('idle'), 2000) })
      .catch(() => setCopyState('error'))
  }

  // Web Share
  const handleShare = async () => {
    if (navigator.share) {
      try {
        // QR 이미지 포함해서 공유
        if (canvasRef.current && qrReady) {
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvasRef.current!.toBlob((b) => b ? resolve(b) : reject(new Error('blob 생성 실패')))
          )
          const file = new File([blob], `자산QR_${assetNo}.png`, { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: `자산번호: ${assetNo}`,
              text: `자산번호: ${assetNo}${assetInfo?.name ? ` (${assetInfo.name})` : ''}`,
              files: [file],
            })
            return
          }
        }
        await navigator.share({
          title: `자산번호: ${assetNo}`,
          text: `자산번호: ${assetNo}${assetInfo?.name ? ` (${assetInfo.name})` : ''}`,
          url: window.location.href,
        })
      } catch { /* 공유 취소 무시 */ }
    }
  }

  const handleDownloadQr = () => {
    if (!canvasRef.current || !qrReady) return
    const link = document.createElement('a')
    link.download = `자산QR_${assetNo}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  if (!assetNo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center text-error">
          <div className="text-4xl mb-2">⚠️</div>
          <p>자산번호가 없습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body gap-4 text-center">
          {/* 자동 복사 상태 */}
          {copyState === 'copying' && (
            <div className="text-4xl animate-pulse">📋</div>
          )}
          {copyState === 'copied' && (
            <div className="text-5xl">✅</div>
          )}
          {copyState === 'error' && (
            <div className="text-4xl">❌</div>
          )}
          {copyState === 'idle' && (
            <div className="text-4xl">📋</div>
          )}

          <div>
            {copyState === 'copied' && (
              <h2 className="text-lg font-bold text-success">클립보드에 복사됨!</h2>
            )}
            {copyState === 'error' && (
              <h2 className="text-lg font-bold text-error">자동 복사 실패</h2>
            )}
            {copyState === 'copying' && (
              <h2 className="text-lg font-bold">복사 중...</h2>
            )}
          </div>

          {/* 자산번호 */}
          <div className="bg-base-200 rounded-xl p-4">
            <p className="text-xs text-base-content/50 mb-1">자산번호</p>
            <p className="text-2xl font-mono font-bold text-primary tracking-wide">{assetNo}</p>
          </div>

          {/* QR 코드 이미지 */}
          <div className="flex flex-col items-center gap-2">
            <canvas ref={canvasRef} className="rounded-xl border border-base-300" />
            {!qrReady && <p className="text-xs text-base-content/40">QR 생성 중...</p>}
          </div>

          {/* 자산 정보 (있으면 표시) */}
          {assetInfo && (
            <div className="text-sm text-left bg-base-200 rounded-xl p-3 space-y-1">
              {assetInfo.name && <p><span className="text-base-content/50">자산명:</span> {assetInfo.name}</p>}
              {assetInfo.dept && <p><span className="text-base-content/50">부서:</span> {assetInfo.dept}</p>}
              {assetInfo.location && <p><span className="text-base-content/50">위치:</span> {assetInfo.location}</p>}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 flex-col">
            <button className="btn btn-primary w-full" onClick={handleManualCopy}>
              {copyState === 'copied' ? '✓ 복사됨' : '📋 다시 복사'}
            </button>
            <div className="flex gap-2">
              {qrReady && (
                <button className="btn btn-outline btn-sm flex-1" onClick={handleDownloadQr}>
                  ⬇ QR 저장
                </button>
              )}
              {typeof navigator.share === 'function' && (
                <button className="btn btn-outline btn-sm flex-1" onClick={() => void handleShare()}>
                  공유
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-base-content/40">
            카메라 앱으로 QR을 스캔하면 자산번호가<br />자동으로 클립보드에 복사됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
