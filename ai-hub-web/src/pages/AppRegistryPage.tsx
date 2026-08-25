import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAppCatalog } from '../context/AppCatalogContext'
import { APP_REGISTRY } from '../apps/registry'
import type { AppCategory } from '../apps/types'

export default function AppRegistryPage() {
  const navigate = useNavigate()
  const {
    isPublished,
    publishApp,
    unpublishApp,
    selectApp,
    loading,
    error,
  } = useAppCatalog()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handlePublish = async (appId: string, published: boolean) => {
    setBusyId(appId)
    setActionError(null)
    try {
      if (published) await publishApp(appId)
      else await unpublishApp(appId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '앱 등록 상태를 바꾸지 못했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  const handleTest = async (appId: string) => {
    setBusyId(appId)
    setActionError(null)
    try {
      if (!isPublished(appId)) await publishApp(appId)
      selectApp(appId, true)
      navigate('/dashboard')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '앱을 등록하지 못했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="min-h-[calc(100vh-60px)] bg-background text-on-surface font-body text-body">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6">
          <h1 className="mb-1 font-display text-display text-on-surface">앱 등록</h1>
          <p className="font-body-sm text-on-surface-variant">
            관리자 계정에서 앱을 테스트하면 사용자 마켓플레이스에 등록됩니다.
            사용자는 등록된 앱만 선택해 사용할 수 있습니다.
          </p>
        </div>

        {(error || actionError) && (
          <p className="mb-4 rounded-lg border border-error/30 bg-error-container/30 px-3 py-2 text-caption text-error" role="alert">
            {actionError ?? error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {APP_REGISTRY.map((app) => {
            const published = isPublished(app.id)
            const category = app.category as AppCategory
            return (
              <article
                key={app.id}
                className="relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-white p-4"
              >
                <div className={`absolute left-0 top-0 h-1 w-full ${published ? 'bg-primary' : 'bg-outline'}`} />
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container text-primary">
                    <Icon name={app.icon} className="text-2xl" />
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 font-label text-label ${
                      published ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {published ? '등록됨' : '미등록'}
                  </span>
                </div>
                <h2 className="mb-1 font-h2 text-h2 text-on-surface">{app.name}</h2>
                <p className="mb-1 font-caption text-caption text-on-surface-variant">{category}</p>
                <p className="mb-4 flex-1 font-body-sm text-on-surface-variant">{app.description}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleTest(app.id)}
                    className="rounded-lg border border-outline px-3 py-1.5 font-h3 text-h3 text-on-surface hover:bg-surface-container"
                  >
                    테스트
                  </button>
                  <button
                    type="button"
                    disabled={busyId === app.id || loading}
                    onClick={() => void handlePublish(app.id, !published)}
                    className={`rounded-lg px-3 py-1.5 font-h3 text-h3 text-white disabled:opacity-50 ${
                      published ? 'bg-on-surface-variant' : 'bg-primary'
                    }`}
                  >
                    {busyId === app.id ? '저장 중' : published ? '등록 해제' : '사용자에게 등록'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
          <Icon name="info" className="shrink-0 text-[20px] text-primary" />
          <p className="text-caption text-on-surface-variant">
            등록된 앱은 사용자 마켓플레이스에 표시됩니다. 사용 여부는 각 사용자가
            <Link to="/marketplace" className="mx-1 font-medium text-primary hover:underline">마켓플레이스</Link>
            와
            <Link to="/installed-apps" className="mx-1 font-medium text-primary hover:underline">설치된 앱</Link>
            에서 선택합니다.
          </p>
        </div>
      </div>
    </main>
  )
}
