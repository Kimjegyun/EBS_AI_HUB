import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { APP_MAP } from '../apps/registry'
import { useAppCatalog } from '../context/AppCatalogContext'

export default function InstalledAppsPage() {
  const { installedIds, activeIds, setAppActive, selectApp } = useAppCatalog()
  const apps = installedIds.map((id) => APP_MAP[id]).filter(Boolean)
  const activeCount = apps.filter((app) => activeIds.includes(app.id)).length

  return (
    <main className="min-h-[calc(100vh-60px)] bg-background text-on-surface font-body text-body">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h1 className="mb-1 font-h1 text-h1 text-on-surface">내 앱</h1>
              <p className="text-body-sm text-on-surface-variant">
                사용하기로 선택한 앱을 대시보드에 켜거나 끌 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-highest px-3 py-1.5 font-label text-label text-on-surface-variant">
                <Icon name="apps" className="text-[16px] text-primary" />
                {apps.length}개 선택 · {activeCount}개 ON
              </span>
              <Link
                to="/marketplace"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 font-label text-label text-primary hover:bg-primary/10"
              >
                <Icon name="storefront" className="text-[16px]" />
                앱 선택
              </Link>
            </div>
          </div>
        </div>

        {apps.length === 0 ? (
          <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container px-6 py-12 text-center">
            <Icon name="apps" className="mb-2 text-[36px] text-on-surface-variant" />
            <p className="mb-3 text-body text-on-surface-variant">
              아직 선택한 앱이 없습니다. 마켓플레이스에서 사용할 앱을 고르세요.
            </p>
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-h3 text-h3 text-white hover:opacity-90"
            >
              마켓플레이스로 이동
            </Link>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {apps.map((app) => {
              const isActive = activeIds.includes(app.id)
              return (
                <article
                  key={app.id}
                  className={`flex flex-col rounded-lg border bg-white p-3 ${
                    isActive ? 'border-primary/40' : 'border-outline-variant'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={app.icon} className="text-[20px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-h3 text-h3 text-on-surface">{app.name}</h2>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      aria-label={`${app.name} ${isActive ? '대시보드에서 숨기기' : '대시보드에 표시'}`}
                      onClick={() => setAppActive(app.id, !isActive)}
                      className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${
                        isActive ? 'bg-primary' : 'bg-outline'
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-transform ${
                          isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mb-3 line-clamp-2 text-caption leading-snug text-on-surface-variant">
                    {app.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => selectApp(app.id, false)}
                    className="self-start text-caption text-on-surface-variant hover:text-error"
                  >
                    선택 해제
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
