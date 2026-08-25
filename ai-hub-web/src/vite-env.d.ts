/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_PORTAL?: 'admin' | 'user'
  readonly VITE_APP_SHELL?: 'app' | 'log'
  readonly VITE_IO_LOG_TAB_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
