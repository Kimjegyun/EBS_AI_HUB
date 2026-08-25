const LOG_TAB_NAME = 'ai-hub-io-log'

function logTabUrl(): string {
  const preferred = import.meta.env.VITE_IO_LOG_TAB_URL?.trim()
  const raw = preferred || `${window.location.origin}/`
  try {
    const url = new URL(raw, window.location.origin)
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return 'https://localhost:5175/'
  }
}

export function openIoLogWindow(): void {
  const tab = window.open(logTabUrl(), LOG_TAB_NAME)
  tab?.focus()
}

export function toggleIoLogWindow(): void {
  openIoLogWindow()
}
