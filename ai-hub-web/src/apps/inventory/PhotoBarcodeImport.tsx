import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { decodePhotoFiles } from './barcodeFrameDecoder'
import { getPhotos } from './photoService'

export type PhotoCodeState = 'new' | 'surveyed' | 'other' | 'invalid'
export interface PhotoCodeMatch {
  /** Normalized code read from the label. */
  code: string
  state: PhotoCodeState
  /** Master asset number (old-format codes resolve to the current number). */
  assetNo?: string
  name?: string
  /** Read from the printed number (OCR) because the photo had no QR/barcode. */
  viaOcr?: boolean
}
interface Row { fileName: string; matches: PhotoCodeMatch[] }

interface PhotoBarcodeImportProps {
  disabled?: boolean
  /** Photos attached in the survey screen (photo store ids) — these are analyzed. */
  photoIds: string[]
  resolve: (decodedText: string) => Promise<PhotoCodeMatch>
  /** Matches OCR text of a photo without codes to master assets (printed-number labels). */
  resolveOcr: (ocrText: string) => Promise<PhotoCodeMatch[]>
  /** Saves the given master asset numbers as surveyed; returns how many were saved. */
  onApply: (assetNos: string[]) => Promise<number>
  /** Shows a short message (e.g. nothing attached yet). */
  onNotice: (message: string) => void
}

const STATE_LABEL: Record<PhotoCodeState, string> = {
  new: '신규 반영',
  surveyed: '이미 조사됨',
  other: '이 본부 자산 아님',
  invalid: '자산번호 아님',
}
const STATE_CLASS: Record<PhotoCodeState, string> = {
  new: 'bg-success/15 text-success',
  surveyed: 'bg-surface-container-high text-on-surface-variant',
  other: 'bg-warning/15 text-warning',
  invalid: 'bg-error/10 text-error',
}

/**
 * 사진 분석: reads asset QR codes and 1D barcodes from the photos attached in the
 * survey screen and records the new assets in the current survey.
 */
export default function PhotoBarcodeImport({ disabled, photoIds, resolve, resolveOcr, onApply, onNotice }: PhotoBarcodeImportProps) {
  const [progress, setProgress] = useState<{ done: number; total: number; ocr?: boolean } | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [applying, setApplying] = useState(false)

  const analyze = async () => {
    const photos = await getPhotos(photoIds)
    if (!photos.length) { onNotice('분석할 이미지를 첨부하세요.'); return }
    setProgress({ done: 0, total: photos.length })
    try {
      // Attached photos are stored as JPEG data URLs; the worker decodes the image bytes.
      const files = await Promise.all(photos.map((photo) => fetch(photo.dataUrl).then((response) => response.blob())))
      const decoded = await decodePhotoFiles(files, (done) => setProgress({ done, total: files.length }))
      const next: Row[] = []
      for (const [index, texts] of decoded.entries()) {
        const matches: PhotoCodeMatch[] = []
        const add = (match: PhotoCodeMatch) => {
          // An old and a new label on one device resolve to the same asset.
          if (!matches.some((item) => (item.assetNo ?? item.code) === (match.assetNo ?? match.code))) matches.push(match)
        }
        for (const text of texts) add(await resolve(text))
        // No QR/barcode: read the printed asset number instead (labels with only text).
        if (!texts.length) {
          setProgress({ done: index + 1, total: files.length, ocr: true })
          const { recognizeAssetText } = await import('./assetOcr')
          const ocrText = await recognizeAssetText(files[index]).catch(() => '')
          for (const match of await resolveOcr(ocrText)) add(match)
        }
        next.push({ fileName: `첨부 사진 ${index + 1}`, matches })
      }
      setRows(next)
    } finally {
      setProgress(null)
    }
  }

  const newAssetNos = [...new Set((rows ?? []).flatMap((row) => row.matches.filter((match) => match.state === 'new' && match.assetNo).map((match) => match.assetNo!)))]
  const unreadable = (rows ?? []).filter((row) => row.matches.length === 0).length

  const apply = async () => {
    setApplying(true)
    try {
      await onApply(newAssetNos)
      setRows(null)
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void analyze().catch((error: unknown) => { setProgress(null); onNotice(`사진 분석 실패: ${(error as Error).message}`) })}
        disabled={disabled || !!progress}
        title="첨부한 라벨 사진에서 QR·바코드를 읽어 조사에 반영합니다"
        className="no-drag inline-flex items-center gap-1 px-3 py-2.5 rounded-lg border border-outline-variant text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
      >
        <Icon name={progress ? 'progress_activity' : 'image_search'} className={`text-[18px] ${progress ? 'animate-spin' : ''}`} />
        {progress ? `${progress.ocr ? '글자 ' : ''}${progress.done}/${progress.total}` : '사진 분석'}
      </button>

      {rows && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="사진 판독 결과">
          <div className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-surface shadow-xl">
            <div className="p-4 border-b border-outline-variant">
              <h3 className="font-h3 text-h3">사진 판독 결과</h3>
              <p className="text-caption text-on-surface-variant">
                사진 {rows.length}장 · 신규 {newAssetNos.length}건{unreadable ? ` · 인식 실패 ${unreadable}장` : ''}
              </p>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant">
              {rows.map((row, index) => (
                <li key={`${row.fileName}-${index}`} className="px-4 py-2.5">
                  <p className="text-caption text-on-surface-variant truncate">{row.fileName}</p>
                  {row.matches.length === 0
                    ? <p className="text-body-sm text-error">QR·바코드와 자산번호 글자를 찾지 못했습니다. 라벨이 크고 선명하게, 반사 없이 나온 사진으로 다시 시도하세요.</p>
                    : row.matches.map((match) => (
                      <div key={match.assetNo ?? match.code} className="flex items-center justify-between gap-2 text-body-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{match.assetNo ?? match.code}</span>
                          {match.viaOcr && <span className="ml-1 rounded bg-secondary/15 px-1 text-[10px] font-semibold text-secondary">글자 인식</span>}
                          {match.assetNo && match.assetNo.replace(/[^A-Z0-9]/gi, '') !== match.code.replace(/[^A-Z0-9]/gi, '') && <span className="text-on-surface-variant"> (라벨 {match.code})</span>}
                          {match.name && <span className="text-on-surface-variant"> · {match.name}</span>}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-caption ${STATE_CLASS[match.state]}`}>{STATE_LABEL[match.state]}</span>
                      </div>
                    ))}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 p-4 border-t border-outline-variant">
              <button type="button" onClick={() => setRows(null)} disabled={applying} className="flex-1 rounded-lg border border-outline-variant py-2.5 text-body-sm">닫기</button>
              <button type="button" onClick={() => void apply()} disabled={applying || newAssetNos.length === 0}
                className="flex-1 rounded-lg bg-primary text-on-primary py-2.5 text-body-sm font-medium disabled:opacity-50">
                {applying ? '반영 중…' : `${newAssetNos.length}건 조사에 반영`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
