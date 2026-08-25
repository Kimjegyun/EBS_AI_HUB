import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import RequireAdmin from './components/RequireAdmin'
import RequireAuth from './components/RequireAuth'
import { AppCatalogProvider } from './context/AppCatalogContext'
import { EnvironmentConfigProvider } from './context/EnvironmentConfigContext'
import { isIoLogShell } from './lib/appShell'
import AppRegistryPage from './pages/AppRegistryPage'
import DashboardPage from './pages/DashboardPage'
import InstalledAppsPage from './pages/InstalledAppsPage'
import IoLogPage from './pages/IoLogPage'
import LoginPage from './pages/LoginPage'
import MarketplacePage from './pages/MarketplacePage'
import PlaceholderPage from './pages/PlaceholderPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SettingsPage from './pages/SettingsPage'
import UsersPage from './pages/UsersPage'
import NotificationsPage from './pages/NotificationsPage'
import PairPage from './apps/inventory/PairPage'
import AssetQrPage from './apps/inventory/AssetQrPage'
import InventoryStandaloneApp from './apps/inventory/InventoryStandaloneApp'

// Wrapper: extract :assetNo param and pass as prop
function AssetQrRoute() {
  const { assetNo = '' } = useParams<{ assetNo: string }>()
  return <AssetQrPage assetNo={decodeURIComponent(assetNo)} />
}

function IoLogShell() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<IoLogPage />} />
        <Route path="/io-log" element={<IoLogPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  if (isIoLogShell()) {
    return <IoLogShell />
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <EnvironmentConfigProvider>
          <AppCatalogProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                path="/io-log"
                element={
                  <RequireAdmin>
                    <IoLogPage />
                  </RequireAdmin>
                }
              />
              {/* 인증 없이 접근 가능한 공개 라우트 */}
              <Route path="/pair" element={<PairPage />} />
              <Route path="/asset/:assetNo" element={<AssetQrRoute />} />
              {/* 재물조사 독립 앱 — 인증 불필요, 핸드폰 홈화면 설치용 */}
              <Route path="/inventory" element={<InventoryStandaloneApp />} />
              <Route path="/inventory/*" element={<InventoryStandaloneApp />} />
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/installed-apps" element={<InstalledAppsPage />} />
                <Route path="/marketplace" element={<MarketplacePage />} />
                <Route
                  path="/app-registry"
                  element={
                    <RequireAdmin>
                      <AppRegistryPage />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <RequireAdmin>
                      <UsersPage />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <RequireAdmin>
                      <NotificationsPage />
                    </RequireAdmin>
                  }
                />
                <Route path="/modules" element={<PlaceholderPage title="모듈" />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AppCatalogProvider>
        </EnvironmentConfigProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
