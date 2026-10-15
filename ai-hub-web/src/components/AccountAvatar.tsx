import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const characters = [
  { file: 'pengsoo.jpg', name: '펭수', width: 763, size: 190, x: 493, y: 5 },
  { file: 'bbung.jpg', name: '뿡뿡이', width: 640, size: 210, x: 110, y: 250 },
  { file: 'dingdongdang.jpg', name: '딩동댕 친구', width: 640, size: 150, x: 130, y: 190 },
]
type Avatar = { character: number; image?: string }
function valid(value: unknown): value is Avatar {
  const v = value as Avatar | null
  return !!v && Number.isInteger(v.character) && v.character >= 0 && v.character < characters.length
    && (v.image === undefined || (typeof v.image === 'string' && v.image.startsWith('data:image/jpeg;base64,') && v.image.length < 40000))
}

export default function AccountAvatar({ account, editable }: { account: string; editable: boolean }) {
  const storageKey = `ai-hub:account-avatar:${account.toLowerCase()}`
  const [avatar, setAvatar] = useState<Avatar>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (valid(saved)) return saved } catch { /* unavailable storage */ }
    return { character: crypto.getRandomValues(new Uint32Array(1))[0] % characters.length }
  })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const changed = useRef(false)
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(avatar)) } catch { /* UI remains usable */ }
  }, [avatar, storageKey])
  useEffect(() => {
    let active = true
    void supabase?.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!active || changed.current || !user || (user.id !== account && user.email?.toLowerCase() !== account.toLowerCase())) return
      const saved: unknown = user.user_metadata.ai_hub_avatar
      if (valid(saved)) setAvatar(saved)
    }).catch(() => {})
    return () => { active = false }
  }, [account])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  async function save(next: Avatar) {
    changed.current = true
    setAvatar(next)
    setMessage('이 브라우저에 저장되었습니다.')
    if (!supabase) return
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user || (data.user.id !== account && data.user.email?.toLowerCase() !== account.toLowerCase())) return
    const result = await supabase.auth.updateUser({ data: { ai_hub_avatar: next } })
    setMessage(result.error ? '이 브라우저에 저장됨 · 계정 동기화에 실패했습니다. 다시 시도해 주세요.' : '계정 이미지가 저장되었습니다.')
  }
  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setMessage('')
    let url = ''
    try {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('JPG, PNG, WebP, GIF 이미지(5MB 이하)를 선택해 주세요.')
      url = URL.createObjectURL(file)
      const image = new Image()
      image.src = url
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 128, 128)
      const size = Math.min(image.naturalWidth, image.naturalHeight)
      context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 128, 128)
      const next = { ...avatar, image: canvas.toDataURL('image/jpeg', 0.8) }
      if (!valid(next)) throw new Error('이미지를 줄여서 다시 선택해 주세요.')
      await save(next)
    } catch (error) { setMessage(error instanceof Error ? error.message : '이미지를 저장하지 못했습니다.') }
    finally { if (url) URL.revokeObjectURL(url); setBusy(false); if (input.current) input.current.value = '' }
  }
  const character = characters[avatar.character]
  return <div ref={root} className="relative shrink-0">
    <button type="button" data-account-avatar aria-label={editable ? '계정 이미지 변경' : '계정 이미지'} aria-expanded={editable ? open : undefined}
      title={editable ? '클릭 또는 마우스 오른쪽 버튼으로 이미지 변경' : character.name}
      onClick={() => editable && setOpen(!open)} onContextMenu={event => { if (editable) { event.preventDefault(); setOpen(true) } }}
      className="w-10 h-10 flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <span className="relative block w-8 h-8 overflow-hidden rounded-full border border-outline-variant bg-amber-100">
        {avatar.image ? <img src={avatar.image} alt="계정 프로필" className="w-full h-full object-cover" />
          : <img src={`${import.meta.env.BASE_URL}avatars/${character.file}`} alt={character.name} className="absolute max-w-none" style={{ width: `${character.width / character.size * 100}%`, left: `${-character.x / character.size * 100}%`, top: `${-character.y / character.size * 100}%` }} />}
      </span>
    </button>
    {editable && open && <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-outline-variant bg-surface p-2 shadow-xl z-[80]" aria-label="계정 이미지 설정">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="w-full text-left px-3 py-2 rounded hover:bg-surface-container text-sm disabled:opacity-50">{busy ? '저장 중…' : '원하는 이미지로 변경'}</button>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await save({ character: (avatar.character + 1 + crypto.getRandomValues(new Uint32Array(1))[0] % (characters.length - 1)) % characters.length }) } catch { setMessage('계정 동기화에 실패했습니다.') } finally { setBusy(false) } }} className="w-full text-left px-3 py-2 rounded hover:bg-surface-container text-sm disabled:opacity-50">EBS 캐릭터로 변경</button>
      <p className="px-3 pt-1 text-xs text-on-surface-variant">JPG · PNG · WebP · GIF / 최대 5MB</p>
      {message && <p role="status" className="px-3 py-2 text-xs text-on-surface-variant">{message}</p>}
    </div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" aria-label="프로필 이미지 파일" onChange={event => void upload(event.target.files?.[0])} />
  </div>
}
