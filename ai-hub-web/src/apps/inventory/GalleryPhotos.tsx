import { useEffect, useRef, useState } from 'react'
import { deletePhotos, getPhotos, importPhotos, type StoredPhoto } from './photoService'

export default function GalleryPhotos({ ids, onAdd, onRemove, onBusy, disabled = false, assetNo }: {
  ids: string[]; onAdd: (ids: string[]) => void; onRemove: (id: string) => void; onBusy: (busy: boolean) => void; disabled?: boolean; assetNo?: string
}) {
  const [photos, setPhotos] = useState<StoredPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const active = useRef(true)
  const importing = useRef(false)
  const callbacks = useRef({ onAdd, onBusy })
  callbacks.current = { onAdd, onBusy }
  useEffect(() => { active.current = true; return () => { active.current = false; callbacks.current.onBusy(false) } }, [])
  useEffect(() => {
    let live = true
    void getPhotos(ids).then(list => { if (live) setPhotos(list) }).catch(() => { if (live) setMessage('저장된 사진을 불러오지 못했습니다.') })
    return () => { live = false }
  }, [ids])
  async function select(files: File[]) {
    if (!files.length || importing.current || disabled) return
    importing.current = true; setBusy(true); callbacks.current.onBusy(true); setErrors([])
    try {
      const result = await importPhotos(files, (done, total) => { if (active.current) setMessage(`사진 처리 ${done}/${total}`) })
      if (!active.current) { await deletePhotos(result.photos.map(photo => photo.id)); return }
      callbacks.current.onAdd(result.photos.map(photo => photo.id))
      setMessage(`${result.photos.length}장 첨부 · 실패 ${result.errors.length}장`); setErrors(result.errors)
    } finally {
      importing.current = false
      if (active.current) { setBusy(false); callbacks.current.onBusy(false) }
    }
  }
  return <section className="rounded-lg border border-outline-variant p-2 space-y-2">
    <label className={`relative flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-body-sm font-medium text-primary ${disabled || busy ? 'opacity-50' : 'cursor-pointer'}`}>
      자산이미지첨부
      <span className="text-caption">{ids.length}장</span>
      <input aria-label="갤러리 사진 여러 장 첨부" type="file" accept="image/*" multiple disabled={busy || disabled} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" onChange={event => {
        const files = Array.from(event.target.files || []); event.target.value = ''; void select(files)
      }} />
    </label>
    <p className="break-words text-caption text-on-surface-variant">{assetNo ? `자산 ${assetNo}에 첨부됩니다. 건별 저장 후 ‘확인 결과 서버 반영’을 누르면 함께 전송됩니다.` : ids.length ? `사진 ${ids.length}장 연결 대기 중입니다. 이 사진에 해당하는 자산을 스캔하거나 조회한 뒤 건별 저장해 주세요. 저장 전에는 화면을 닫지 마세요.` : '갤러리에서 여러 사진을 먼저 선택할 수 있습니다. 선택한 사진은 다음에 스캔하거나 조회한 자산 한 건에 연결됩니다.'}</p>
    <div className="flex flex-wrap gap-2">{photos.map(photo => <figure key={photo.id} className="w-24">
      <a href={photo.dataUrl} target="_blank" rel="noreferrer"><img src={photo.dataUrl} alt="첨부한 자산 사진" className="h-20 w-24 rounded object-contain bg-surface" /></a>
      <button type="button" disabled={busy} onClick={() => onRemove(photo.id)} className="w-full text-caption text-error">첨부 해제</button>
    </figure>)}</div>
    {message && <p role="status" className="text-caption">{message}</p>}
    {!!errors.length && <ul role="alert" className="text-caption text-error">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
  </section>
}
