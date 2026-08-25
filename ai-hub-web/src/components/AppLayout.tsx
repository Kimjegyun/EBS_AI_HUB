import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import EnvironmentSettingsDialog from './EnvironmentSettingsDialog'
import AdminIoLogButton from './AdminIoLogButton'
import { Icon } from './Icon'
import { useIsMobile } from '../hooks/useIsMobile'
import { getPendingCount, subscribeNotifications } from '../lib/notificationService'

function navClass(active: boolean) {
  return [
    'flex items-center gap-2 rounded-lg px-2.5 py-2 mx-2 transition-all font-label text-label',
    active
      ? 'bg-primary-container text-on-primary-container shadow-sm'
      : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high',
  ].join(' ')
}

function topNavClass(active: boolean) {
  return active
    ? 'text-primary font-bold border-b-2 border-primary pb-1 font-h3 text-h3'
    : 'font-h3 text-h3 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors px-3 py-1 rounded'
}

export default function AppLayout() {
  const { session, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [envDialogOpen, setEnvDialogOpen] = useState(false)
  const isMobile = useIsMobile()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingCount(getPendingCount())
    return subscribeNotifications(() => setPendingCount(getPendingCount()))
  }, [isAdmin])

  if (isMobile) {
    const tabs = [
      { to: '/dashboard', icon: 'home', label: '홈' },
      { to: '/installed-apps', icon: 'apps', label: '앱' },
      { to: '/marketplace', icon: 'storefront', label: '탐색' },
      ...(isAdmin ? [{ to: '/users', icon: 'group', label: '관리' }] : []),
      { to: '/settings', icon: isAdmin ? 'settings' : 'person', label: isAdmin ? '설정' : '내정보' },
    ]

    return (
      <div className="min-h-[100svh] bg-background text-on-surface font-body text-body overflow-hidden">
        <header className="fixed inset-x-0 top-0 z-50 h-14 bg-surface-container border-b border-outline-variant px-3 pt-[env(safe-area-inset-top)] flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-h3 text-h3 text-primary leading-tight">EBS AI 허브</div>
            <div className="text-caption text-on-surface-variant truncate max-w-[210px]">
              {session?.displayName ?? 'User'} · {isAdmin ? 'ADMIN' : 'USER'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/app-registry')}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-primary hover:bg-primary/10"
                aria-label="앱 등록"
              >
                <Icon name="inventory_2" className="text-[20px]" />
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEnvDialogOpen(true)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-primary hover:bg-primary/10"
                aria-label="환경 설정"
              >
                <Icon name="tune" className="text-[20px]" />
              </button>
            )}
            <AdminIoLogButton compact />
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
              aria-label="로그아웃"
            >
              <Icon name="logout" className="text-[20px]" />
            </button>
          </div>
        </header>

        <main className="h-[100svh] overflow-y-auto pt-14 pb-[calc(64px+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-outline-variant bg-surface-container/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                    isActive ? 'text-primary' : 'text-on-surface-variant',
                  ].join(' ')
                }
              >
                <Icon name={tab.icon} className="text-[22px]" />
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {isAdmin && (
          <EnvironmentSettingsDialog open={envDialogOpen} onClose={() => setEnvDialogOpen(false)} />
        )}
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background text-on-surface font-body text-body overflow-hidden">
      <header className="fixed top-0 w-full h-topbar-height z-50 bg-surface-container border-b border-outline-variant shadow-sm flex justify-between items-center px-5">
        <div className="flex items-center gap-5">
          <span className="font-h2 text-h2 font-bold text-primary">EBS AI 허브</span>
          <div className="hidden md:flex items-center gap-6">
            <NavLink to="/dashboard" className={({ isActive }) => topNavClass(isActive)}>
              Dashboard
            </NavLink>
            <NavLink to="/marketplace" className={({ isActive }) => topNavClass(isActive)}>
              Marketplace
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 mr-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label text-label border ${
                isAdmin
                  ? 'bg-primary/10 text-primary border-primary/25'
                  : 'bg-surface-container-high text-on-surface-variant border-outline-variant'
              }`}
            >
              <Icon name={isAdmin ? 'admin_panel_settings' : 'person'} className="text-[16px]" />
              {isAdmin ? '관리자' : '사용자'}
            </span>
            {session && (
              <span className="hidden lg:inline font-caption text-on-surface-variant max-w-[140px] truncate" title={session.email}>
                {session.displayName}
              </span>
            )}
          </div>
          <div className="relative hidden sm:block">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              className="bg-surface-container-high border border-outline-variant rounded-lg pl-9 pr-3 py-1.5 text-body-sm w-44 lg:w-56 focus:ring-2 focus:ring-primary/25 focus:outline-none"
              placeholder="Search modules..."
              type="search"
              aria-label="모듈 검색"
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEnvDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 font-label text-label text-primary hover:bg-primary/10 transition-colors"
              aria-label="환경 정보 설정"
            >
              <Icon name="tune" className="text-[18px]" />
              <span className="hidden md:inline">환경</span>
            </button>
          )}
          <AdminIoLogButton />
          <button
            type="button"
            className="p-2 rounded-full hover:bg-surface-container-highest transition-colors flex items-center justify-center"
            aria-label="알림"
          >
            <Icon name="notifications" className="text-on-surface-variant" />
          </button>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-surface-container-highest transition-colors flex items-center justify-center"
            aria-label="도움말"
          >
            <Icon name="help" className="text-on-surface-variant" />
          </button>
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
            className="hidden sm:inline-flex items-center gap-1 font-caption text-caption text-on-surface-variant hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-container-high"
          >
            <Icon name="logout" className="text-[18px]" />
            로그아웃
          </button>
          <div className="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center border border-outline-variant overflow-hidden">
            <img
              alt=""
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDaHPvbFJSGz3r5pEYwPjtTPE9I19OkF51OMIoMYo21r2dUtO57nJ4sSzqTqSlBvUuiN06oF2nNZxUlhSUj8WsyFgMv2-j3kPbsmJYyXk0MKJZsVQCpraPs0BHfs8ispX2xnHNIktDtGbRzrr3RnRkqpeIly4yQtfjU9krZyYjTwArR-o0bMlelGdYzh5KsVKf-oBOF5z3P0M76tMjm3xm2mI_CufvVkcuQpOf9Qu3AphLWeLsFSX0iRFjDSw-IKL9yYKa9fjLtioA"
            />
          </div>
        </div>
      </header>

      <aside className="fixed left-0 top-0 h-full w-[160px] z-40 bg-surface-container-lowest border-r border-outline-variant shadow-sm flex flex-col py-4 pt-[60px]">
        <nav className="flex flex-col gap-1 mt-3 flex-grow">
          <NavLink to="/dashboard" className={({ isActive }) => navClass(isActive)}>
            <Icon name="dashboard" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/installed-apps" className={({ isActive }) => navClass(isActive)}>
            <Icon name="apps" />
            <span>설치된 앱</span>
          </NavLink>
          <NavLink to="/marketplace" className={({ isActive }) => navClass(isActive)}>
            <Icon name="storefront" />
            <span>Marketplace</span>
          </NavLink>
          {isAdmin ? (
            <NavLink to="/users" className={({ isActive }) => navClass(isActive)}>
              <Icon name="group" />
              <span>Users</span>
            </NavLink>
          ) : (
            <div
              className="flex items-center gap-2 px-2.5 py-2 mx-2 rounded-lg font-label text-label text-on-surface-variant/50 cursor-not-allowed"
              title="관리자만 사용자 관리에 접근할 수 있습니다."
            >
              <Icon name="group" />
              <span>Users</span>
              <Icon name="lock" className="text-[16px] ml-auto opacity-60" />
            </div>
          )}
          {isAdmin && (
            <NavLink to="/notifications" className={({ isActive }) => navClass(isActive)}>
              <div className="relative">
                <Icon name="notifications" />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white leading-none">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </div>
              <span>알림</span>
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/app-registry" className={({ isActive }) => navClass(isActive)}>
              <Icon name="inventory_2" />
              <span>앱 등록</span>
            </NavLink>
          )}
          <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
            <Icon name="settings" />
            <span>Settings</span>
          </NavLink>
        </nav>
        {isAdmin && (
          <div className="px-4 mb-4">
            <button
              type="button"
              onClick={() => navigate('/app-registry')}
              className="w-full bg-primary-container text-on-primary-container font-h3 text-h3 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95"
            >
              <Icon name="rocket_launch" className="text-[18px]" />
              앱 등록
            </button>
          </div>
        )}
        {!isAdmin && (
          <div className="px-3 mb-4 mx-auto max-w-[128px] font-caption text-caption text-on-surface-variant text-center leading-snug break-keep">
            마켓플레이스에서 사용할 앱을 선택하세요.
          </div>
        )}
      </aside>

      <div className="ml-[160px] pt-topbar-height min-h-screen">
        <Outlet />
      </div>

      {isAdmin && (
        <EnvironmentSettingsDialog open={envDialogOpen} onClose={() => setEnvDialogOpen(false)} />
      )}
    </div>
  )
}
