import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../auth/AuthContext'
import { useAppCatalog } from '../context/AppCatalogContext'
import { catalogApps } from '../apps/appAccess'
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
  const { publishedIds, installedIds, selectApp, loading, refresh } = useAppCatalog()
  const [active, setActive] = useState<string>('전체')
  const userCatalog = useMemo(() => catalogApps(false, publishedIds), [publishedIds])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const categories = useMemo(() => {
    const set = new Set<string>(userCatalog.map((a) => a.category))
    return ['전체', '사용 중', ...set]
  }, [userCatalog])

  const visible = userCatalog.filter((app) => {
    if (active === '전체') return true
    if (active === '사용 중') return installedIds.includes(app.id)
    return app.category === active
  })

  return (
    <main className="min-h-[calc(100vh-60px)] bg-background text-on-surface font-body text-body">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="mb-1 font-display text-display text-on-surface">앱 마켓플레이스</h1>
              <p className="font-body-sm text-on-surface-variant">
                관리자가 등록한 앱 중에서 사용할 앱을 선택하세요. 선택한 앱은 대시보드에서 켜고 끌 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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

        {loading && userCatalog.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">등록된 앱을 불러오는 중입니다.</p>
        ) : visible.length === 0 ? (
          <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container px-6 py-12 text-center">
            <Icon name="storefront" className="mb-2 text-[36px] text-on-surface-variant" />
            <p className="text-body text-on-surface-variant">
              {userCatalog.length === 0
                ? '아직 등록된 앱이 없습니다. 관리자가 앱을 테스트한 뒤 등록하면 여기에 표시됩니다.'
                : '이 분류에 해당하는 앱이 없습니다.'}
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((app) => {
              const tone = categoryTone[app.category]
              const selected = installedIds.includes(app.id)
              return (
                <article
                  key={app.id}
                  className="relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-white p-4"
                >
                  <div className={`absolute left-0 top-0 h-1 w-full ${toneBar[tone]}`} />
                  <div className="mb-3 flex items-start justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container ${toneIcon[tone]}`}
                    >
                      <Icon name={app.icon} className="text-2xl" />
                    </div>
                    <span className={`rounded px-2 py-0.5 font-label text-label ${toneBadge[tone]}`}>
                      {app.category}
                    </span>
                  </div>
                  <h2 className="mb-1.5 font-h2 text-h2 text-on-surface">{app.name}</h2>
                  <p className="mb-4 flex-1 font-body-sm text-on-surface-variant">{app.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-caption text-caption text-outline">
                      {app.version ? `v${app.version}` : '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => selectApp(app.id, !selected)}
                      className={`rounded-lg px-4 py-1.5 font-h3 text-h3 font-bold transition-all ${
                        selected
                          ? 'border border-outline text-on-surface hover:bg-surface-container'
                          : 'bg-primary text-white hover:opacity-90'
                      }`}
                    >
                      {selected ? '사용 안 함' : '사용하기'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
