export function isIoLogShell(): boolean {
  const mode = String(import.meta.env.MODE ?? '').trim()
  const shell = String(import.meta.env.VITE_APP_SHELL ?? '').trim()
  return mode === 'log' || shell === 'log'
}
