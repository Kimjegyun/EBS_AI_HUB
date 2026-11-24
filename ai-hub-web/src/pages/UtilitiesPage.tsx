import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { authHeaders, describeAuthStatus } from '../lib/authHeaders'
import { Icon } from '../components/Icon'

interface Utility {
  id: number; slug: string; version: string; title: string; summary: string; category: string; createdAt: string
  features?: string; usage?: string; changes?: string; launchUrl?: string
}
type Draft = Record<'slug' | 'version' | 'title' | 'summary' | 'category' | 'features' | 'usage' | 'changes' | 'launchUrl', string>
const empty: Draft = { slug: '', version: '1.0.0', title: '', summary: '', category: '일반', features: '', usage: '', changes: '첫 버전 발행', launchUrl: '' }
const inputClass = 'mt-1 w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm text-on-surface'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(describeAuthStatus(res.status) || data.error || '페이지를 불러오지 못했습니다.')
  }
  return res.json() as Promise<T>
}

export default function UtilitiesPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<Utility[]>([])
  const [history, setHistory] = useState<Utility[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setError(''); setHistory([])
      try {
        if (slug) {
          const rows = await request<Utility[]>(`/api/utilities/${encodeURIComponent(slug)}`)
          if (active) setHistory(rows)
        } else {
          const rows = await request<Utility[]>('/api/utilities')
          if (active) setItems(rows)
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : '조회 실패') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [slug, revision])
  const requestedVersion = params.get('version')
  const selected = requestedVersion ? history.find((u) => u.version === requestedVersion) : history[0]
  const categories = ['전체', ...new Set(items.map((u) => u.category))]
  const filtered = items.filter((u) => (category === '전체' || u.category === category) && `${u.title} ${u.summary} ${u.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const beginEdit = () => {
    const current = history[0]
    if (!current) return
    setError('')
    setDraft({ slug: current.slug, version: '', title: current.title, summary: current.summary, category: current.category, features: current.features || '', usage: current.usage || '', changes: '', launchUrl: current.launchUrl || '' })
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft || saving) return
    setSaving(true); setError('')
    try {
      await request('/api/utilities', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(draft) })
      const target = draft.slug
      setDraft(null); setRevision((v) => v + 1)
      navigate(`/util/${target}`)
    } catch (e) { setError(e instanceof Error ? e.message : '발행 실패') }
    finally { setSaving(false) }
  }
  return (
    <div className="min-h-screen bg-background font-body text-on-surface">
      <header className="border-b border-outline-variant bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link to="/util" className="flex items-center gap-2 font-bold text-primary"><Icon name="construction" />AI Hub Utilities</Link>
          <nav className="flex gap-4 text-sm"><Link to="/dashboard" className="hover:text-primary">AI Hub</Link><Link to="/marketplace" className="hover:text-primary">마켓플레이스</Link></nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div><p className="mb-2 text-sm font-medium text-primary">작은 도구, 더 편리한 작업</p><h1 className="text-3xl font-bold">유틸리티 자료실</h1><p className="mt-3 text-on-surface-variant">유틸리티의 특징과 사용법을 살펴보고, 버전별 변경 기록을 확인하세요.</p></div>
          {isAdmin && !draft && <button type="button" onClick={() => { setDraft({ ...empty }); setError('') }} className="rounded-lg bg-primary px-4 py-2 text-sm text-white">새 유틸리티 포스팅</button>}
        </div>
        {error && <p className="mb-4 rounded-lg bg-error-container p-3 text-error" role="alert">{error}</p>}
        {isAdmin && draft && <form onSubmit={(e) => void save(e)} className="mb-8 rounded-xl border border-outline-variant bg-white p-5">
          <h2 className="mb-2 text-xl font-semibold">{slug === draft.slug ? '새 개정판 발행' : '유틸리티 포스팅'}</h2>
          <p className="mb-4 text-sm text-on-surface-variant">발행하면 공개됩니다. 기존 버전은 보존되며, 수정 내용은 새 버전으로 기록됩니다.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {([['slug', '주소 ID', 64], ['version', '페이지 버전', 32], ['title', '제목', 120], ['category', '분류', 40], ['summary', '한 줄 소개', 500], ['launchUrl', '실행 / 다운로드 주소 (선택)', 2000]] as const).map(([key, label, max]) => <label key={key} className="text-sm">{label}<input className={inputClass} value={draft[key]} maxLength={max} required={key !== 'launchUrl'} readOnly={key === 'slug' && slug === draft.slug} placeholder={key === 'slug' ? '예: image-resizer' : key === 'version' ? '예: 1.1.0' : undefined} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
          </div>
          {([['features', '주요 특징', 20000], ['usage', '사용법', 30000], ['changes', '이번 버전의 변경 내용', 10000]] as const).map(([key, label, max]) => <label key={key} className="mt-4 block text-sm">{label}<textarea className={inputClass} rows={5} required maxLength={max} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
          <div className="mt-4 flex gap-2"><button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{saving ? '발행 중…' : '공개 발행'}</button><button type="button" disabled={saving} onClick={() => setDraft(null)} className="rounded-lg border border-outline-variant px-4 py-2">취소</button></div>
        </form>}
        {loading ? <p role="status">불러오는 중…</p> : slug ? <>
          <Link to="/util" onClick={() => setDraft(null)} className="text-sm text-primary">← 전체 유틸리티</Link>
          {selected ? <div className="mt-5 grid items-start gap-6 lg:grid-cols-[1fr_280px]">
            <article className="rounded-2xl border border-outline-variant bg-white p-6">
              <div className="mb-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-primary/10 px-3 py-1 text-primary">{selected.category}</span><span className="rounded-full bg-surface-container px-3 py-1">페이지 v{selected.version}</span>{selected.id !== history[0]?.id && <span className="px-2 py-1 text-on-surface-variant">이전 버전 열람 중</span>}</div>
              <h2 className="text-2xl font-bold">{selected.title}</h2><p className="mt-3 text-on-surface-variant">{selected.summary}</p><p className="mt-3 text-xs text-on-surface-variant">발행일 {new Date(selected.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
              {selected.launchUrl && <a href={selected.launchUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-white">유틸리티 열기 ↗</a>}
              {([['주요 특징', selected.features], ['사용법', selected.usage], ['변경 내용', selected.changes]] as const).map(([label, value]) => <section key={label} className="mt-8 border-t border-outline-variant pt-5"><h3 className="mb-3 text-lg font-semibold">{label}</h3><p className="whitespace-pre-wrap break-words leading-7">{value}</p></section>)}
            </article>
            <aside className="rounded-xl border border-outline-variant bg-white p-5"><h2 className="font-semibold">{history.length > 1 ? '페이지 버전 기록' : '현재 공개 버전'}</h2><p className="mt-2 text-xs text-on-surface-variant">{history.length > 1 ? '특징·사용법·변경 내용을 버전별로 보존합니다.' : '현재 배포 중인 유틸리티 정보입니다.'}</p><ol className="mt-4 space-y-3">{history.map((row, index) => <li key={row.id}><button type="button" aria-current={selected.id === row.id ? 'true' : undefined} onClick={() => setParams(index === 0 ? {} : { version: row.version })} className={`w-full rounded-lg border p-3 text-left ${selected.id === row.id ? 'border-primary bg-primary/5' : 'border-outline-variant'}`}><span className="text-sm font-semibold">v{row.version} {index === 0 && '· 최신'}</span><span className="mt-1 block text-xs text-on-surface-variant">{new Date(row.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span><span className="mt-2 block whitespace-pre-wrap break-words text-xs">{row.changes}</span></button></li>)}</ol>{isAdmin && <button type="button" onClick={beginEdit} className="mt-5 w-full rounded-lg bg-primary px-3 py-2 text-sm text-white">새 개정판 작성</button>}</aside>
          </div> : !error && <p className="mt-6">해당 버전을 찾을 수 없습니다. <button type="button" className="text-primary" onClick={() => setParams({})}>최신 버전 보기</button></p>}
        </> : <>
          <div className="mb-6 flex flex-wrap gap-3"><label className="min-w-48 flex-1"><span className="sr-only">유틸리티 검색</span><input className={inputClass} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 소개, 분류로 검색" /></label><label><span className="sr-only">분류</span><select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label></div>
          {filtered.length ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{filtered.map((u) => <Link key={u.slug} to={`/util/${u.slug}`} className="flex flex-col rounded-xl border border-outline-variant bg-white p-5 transition-shadow hover:shadow-md"><div className="mb-4 flex justify-between text-xs text-primary"><span>{u.category}</span><span>v{u.version}</span></div><h2 className="text-lg font-semibold">{u.title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-on-surface-variant">{u.summary}</p><span className="mt-5 text-sm font-medium text-primary">사용법 및 버전 기록 →</span></Link>)}</div> : !error && <div className="rounded-xl border border-dashed border-outline-variant p-12 text-center"><Icon name="construction" className="text-4xl text-primary" /><h2 className="mt-4 text-lg font-semibold">{items.length ? '검색 결과가 없습니다' : '유틸리티를 준비하고 있습니다'}</h2><p className="mt-2 text-sm text-on-surface-variant">{items.length ? '다른 검색어나 분류를 선택해 주세요.' : '새로운 도구와 사용법, 버전별 업데이트가 이곳에 게시됩니다.'}</p></div>}
        </>}
      </main>
    </div>
  )
}
