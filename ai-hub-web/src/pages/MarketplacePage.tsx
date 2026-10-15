import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../auth/AuthContext'
import { useAppCatalog } from '../context/AppCatalogContext'
import AppSubmitPanel from '../components/AppSubmitPanel'
import type { AppCategory } from '../apps/types'

type Tone = 'primary' | 'secondary' | 'tertiary'

const categoryTone: Record<AppCategory, Tone> = {
  코어: 'primary',
  AI: 'primary',
  생산성: 'secondary',
  운영: 'tertiary',
}

const toneIcon: Record<Tone, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
}
const toneBadge: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  tertiary: 'bg-tertiary/10 text-tertiary',
}
const toneBar: Record<Tone, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
}

export default function MarketplacePage() {
  const { isAdmin } = useAuth()
  const { catalog, publishedIds, installedIds, selectApp, loading, refresh, error, remoteLoading, reloadRemoteApps } = useAppCatalog()
  const [active, setActive] = useState<string>('전체')
  const [query, setQuery] = useState('')
  const userCatalog = useMemo(() => catalog.filter(app => publishedIds.includes(app.id)), [catalog, publishedIds])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const categories = useMemo(() => {
    const set = new Set<string>(userCatalog.map((a) => a.category))
    return ['전체', '사용 중', ...set]
  }, [userCatalog])

  const visible = userCatalog.filter((app) => {
    const categoryMatches =
      active === '전체' ||
      (active === '사용 중' ? installedIds.includes(app.id) : app.category === active)
    const term = query.trim().toLocaleLowerCase('ko')
    const searchMatches = !term || [app.name, app.description, app.author, app.category]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ko').includes(term))
    return categoryMatches && searchMatches
  })

  return (
    <main className="min-h-[calc(100vh-48px)] bg-background text-on-surface font-body text-body">
      <div className="w-full p-3">
        <div className="mb-3">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="mb-1 font-display text-display text-on-surface">앱 마켓플레이스</h1>
              <p className="font-body-sm text-on-surface-variant">
                관리자가 등록한 앱 중에서 사용할 앱을 선택하세요. 선택한 앱은 대시보드에서 켜고 끌 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={loading || remoteLoading} onClick={() => { void refresh(); void reloadRemoteApps() }} className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 disabled:opacity-50">
                <Icon name="refresh" className="text-[16px]" />목록 새로고침
              </button>
              <div className="flex flex-wrap rounded-xl border border-outline-variant bg-surface-container-highest p-1">
                {categories.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActive(f)}
                    className={`rounded-lg px-3 py-1.5 font-h3 text-h3 transition-all ${
                      active === f
                        ? 'bg-primary text-white'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {isAdmin && (
                <Link
                  to="/app-registry"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 font-label text-label text-primary hover:bg-primary/10"
                >
                  <Icon name="inventory_2" className="text-[16px]" />
                  앱 등록
                </Link>
              )}
              <Link
                to="/installed-apps"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 font-label text-label text-primary hover:bg-primary/10"
              >
                <Icon name="apps" className="text-[16px]" />
                내 앱
              </Link>
            </div>
          </div>
        </div>

        <label className="mb-5 flex items-center gap-2 rounded-xl border border-outline-variant bg-white px-4 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
          <Icon name="search" className="shrink-0 text-[21px] text-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="앱 이름, 기능 또는 제작자로 검색"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-body text-on-surface placeholder:text-outline focus:ring-0"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기" className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container">
              <Icon name="close" className="text-[18px]" />
            </button>
          )}
        </label>

        {error && <p role="alert" className="mb-3 rounded-lg bg-error/10 p-3 text-error">{error}</p>}
        {(loading || remoteLoading) && userCatalog.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">등록된 앱을 불러오는 중입니다.</p>
        ) : visible.length === 0 ? (
          <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container px-6 py-12 text-center">
            <Icon name="storefront" className="mb-2 text-[36px] text-on-surface-variant" />
            <p className="text-body text-on-surface-variant">
              {userCatalog.length === 0
                ? error ? '목록 새로고침으로 다시 시도해 주세요.' : '아직 등록된 앱이 없습니다. 관리자가 앱을 테스트한 뒤 등록하면 여기에 표시됩니다.'
                : query.trim()
                  ? `“${query.trim()}” 검색 결과가 없습니다.`
                  : '이 분류에 해당하는 앱이 없습니다.'}
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visible.map((app) => {
              const tone = categoryTone[app.category]
              const selected = installedIds.includes(app.id)
              return (
                <article
                  key={app.id}
                  className="relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-white p-4"
                >
                  <div className={`absolute left-0 top-0 h-1 w-full ${toneBar[tone]}`} />
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container ${toneIcon[tone]}`}
                    >
                      <Icon name={app.icon} className="text-lg" />
                    </div>
                    <span className={`rounded px-2 py-0.5 font-label text-label ${toneBadge[tone]}`}>
                      {app.category}
                    </span>
                    <span className="font-caption text-caption text-outline">
                      {app.version ? `v${app.version}` : '—'}
                    </span>
                    <span className="font-caption text-caption text-on-surface-variant" role="status">{selected ? '설치됨' : '미설치'}</span>
                    <button
                      type="button"
                      onClick={() => selectApp(app.id, !selected)}
                      aria-label={`${app.name} ${selected ? '제거' : '설치'}`}
                      className={`ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-semibold min-h-8 max-md:min-h-11 transition-colors ${
                        selected
                          ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600'
                          : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600'
                      }`}
                    >
                      {selected ? '제거' : '설치'}
                    </button>
                  </div>
                  <h2 className="mb-1 font-h2 text-h2 text-on-surface">{app.name}</h2>
                  <p className="flex-1 font-body-sm text-on-surface-variant">{app.description}</p>
                </article>
              )
            })}
          </div>
        )}

        <AppSubmitPanel />
      </div>
    </main>
  )
}
