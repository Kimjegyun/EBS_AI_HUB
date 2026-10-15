type Writer = (event: string, data: unknown) => void
const clients = new Map<string, Set<Writer>>()
export function registerSseClient(scope: string, writer: Writer) {
  if (!clients.has(scope)) clients.set(scope, new Set())
  clients.get(scope)!.add(writer)
  return () => {
    clients.get(scope)?.delete(writer)
    if (!clients.get(scope)?.size) clients.delete(scope)
  }
}
export function broadcast(scope: string, event: string, data: unknown) {
  clients.get(scope)?.forEach(writer => { try { writer(event, data) } catch { /* disconnected client */ } })
}
export function notifySubmission(sessionId: string) {
  broadcast(sessionId, 'result_updated', { sessionId })
  // Admin-only channel: invalidation only, no photos or personal result data.
  broadcast('*', 'submission_updated', { sessionId })
}
