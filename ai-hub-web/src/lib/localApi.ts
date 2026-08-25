export function getLocalApiBaseUrl(): string {
  if (typeof window !== 'undefined') return ''
  const configured = import.meta.env.VITE_API_URL?.trim()
  return (configured || 'http://localhost:3001').replace(/\/+$/, '')
}
