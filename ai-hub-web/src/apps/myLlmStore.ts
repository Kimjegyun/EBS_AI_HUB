import { TENCENT_PROVIDERS, type TencentProviderId } from '../lib/tencentCatalog'
import { loadRawMyLlmState, loadRawMyLlmStateCandidates, saveRawMyLlmState } from './myLlmPersistence'

export type EngineId = 'chatgpt' | TencentProviderId | 'perplexity'
export type PaneSide = 'left' | 'right'
export type SendTarget = 'both' | PaneSide

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  engine?: EngineId
  model?: string
  createdAt: string
  liveNow?: string
  sources?: Array<{ title: string; url: string }>
}

export type ChatThread = {
  id: string
  title: string
  engine: EngineId
  model: string
  updatedAt: string
  messages: Message[]
}

export type PaneState = {
  engine: EngineId
  model: string
  mode: string
  messages: Message[]
}

export type PortalState = {
  nickname: string
  prepaidCredits: number
  usedCredits: number
  selectedContextIds: string[]
  threads: ChatThread[]
  layoutMode: 1 | 2
  sendTarget: SendTarget
  leftPane: PaneState
  rightPane: PaneState
  activeThreadId: string | null
  sharedInput: string
  updatedAt: number
}

export const MODES = ['general', 'document summary', 'code/dev', 'planning review', 'translation', 'data analysis']

export const defaultPaneA: PaneState = {
  engine: 'chatgpt',
  model: 'gpt-5.4',
  mode: 'general',
  messages: [],
}

export const defaultPaneB: PaneState = {
  engine: 'claude',
  model: 'cd-sonnet-4.6',
  mode: 'planning review',
  messages: [],
}

export const defaultState: PortalState = {
  nickname: '팀원',
  prepaidCredits: 500000,
  usedCredits: 128400,
  selectedContextIds: [],
  threads: [],
  layoutMode: 2,
  sendTarget: 'both',
  leftPane: defaultPaneA,
  rightPane: defaultPaneB,
  activeThreadId: null,
  sharedInput: '',
  updatedAt: 0,
}

function isEngineId(value: unknown): value is EngineId {
  if (typeof value !== 'string') return false
  return value === 'chatgpt' || value === 'perplexity' || TENCENT_PROVIDERS.some((item) => item.id === value)
}

function asLayoutMode(value: unknown): 1 | 2 {
  return value === 1 ? 1 : 2
}

function asSendTarget(value: unknown, layoutMode: 1 | 2): SendTarget {
  if (layoutMode === 1) return 'left'
  if (value === 'left' || value === 'right' || value === 'both') return value
  return 'both'
}

function asPane(value: unknown, fallback: PaneState): PaneState {
  if (!value || typeof value !== 'object') return fallback
  const pane = value as Partial<PaneState>
  return {
    engine: isEngineId(pane.engine) ? pane.engine : fallback.engine,
    model: typeof pane.model === 'string' ? pane.model : fallback.model,
    mode: typeof pane.mode === 'string' && MODES.includes(pane.mode) ? pane.mode : fallback.mode,
    messages: Array.isArray(pane.messages) ? pane.messages : fallback.messages,
  }
}

function restorePaneFromThreads(
  pane: PaneState,
  threads: ChatThread[],
  usedThreadIds: Set<string>,
): PaneState {
  if (pane.messages.length > 0 || threads.length === 0) return pane
  const match =
    threads.find((thread) => !usedThreadIds.has(thread.id) && thread.engine === pane.engine && thread.model === pane.model) ||
    threads.find((thread) => !usedThreadIds.has(thread.id) && thread.engine === pane.engine) ||
    threads.find((thread) => !usedThreadIds.has(thread.id))
  if (!match) return pane
  usedThreadIds.add(match.id)
  return { ...pane, messages: match.messages }
}

function parseState(raw: string): PortalState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PortalState>
    const layoutMode = asLayoutMode(parsed.layoutMode)
    const threads = Array.isArray(parsed.threads) ? parsed.threads : []
    const usedThreadIds = new Set<string>()
    const leftPane = restorePaneFromThreads(asPane(parsed.leftPane, defaultPaneA), threads, usedThreadIds)
    const rightPane = restorePaneFromThreads(asPane(parsed.rightPane, defaultPaneB), threads, usedThreadIds)
    return {
      ...defaultState,
      ...parsed,
      layoutMode,
      sendTarget: asSendTarget(parsed.sendTarget, layoutMode),
      leftPane,
      rightPane,
      activeThreadId: typeof parsed.activeThreadId === 'string' ? parsed.activeThreadId : null,
      sharedInput: typeof parsed.sharedInput === 'string' ? parsed.sharedInput : '',
      selectedContextIds: Array.isArray(parsed.selectedContextIds) ? parsed.selectedContextIds : [],
      threads,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

function paneMessageCount(pane: PaneState): number {
  return pane.messages.length
}

function contentScore(state: PortalState): number {
  return state.threads.length * 100 + paneMessageCount(state.leftPane) * 10 + paneMessageCount(state.rightPane) * 10
}

function mergeLoadedStates(states: PortalState[]): PortalState {
  if (states.length === 0) return defaultState
  const newest = states.reduce((best, item) => (item.updatedAt >= best.updatedAt ? item : best))
  const richest = states.reduce((best, item) => (contentScore(item) >= contentScore(best) ? item : best))
  if (contentScore(newest) === 0 && contentScore(richest) > 0) return richest
  return {
    ...newest,
    leftPane: paneMessageCount(newest.leftPane) > 0 ? newest.leftPane : richest.leftPane,
    rightPane: paneMessageCount(newest.rightPane) > 0 ? newest.rightPane : richest.rightPane,
    threads: newest.threads.length >= richest.threads.length ? newest.threads : richest.threads,
    activeThreadId: newest.activeThreadId ?? richest.activeThreadId ?? richest.threads[0]?.id ?? null,
    nickname: newest.nickname || richest.nickname,
  }
}

function loadMergedState(): PortalState {
  if (typeof window === 'undefined') return defaultState
  try {
    const parsed = loadRawMyLlmStateCandidates()
      .map(parseState)
      .filter((item): item is PortalState => Boolean(item))
    if (parsed.length > 0) return mergeLoadedStates(parsed)
    const single = loadRawMyLlmState()
    return single ? parseState(single) ?? defaultState : defaultState
  } catch {
    return defaultState
  }
}

type Listener = () => void
const listeners = new Set<Listener>()
let state: PortalState = loadMergedState()
let persistEnabled = contentScore(state) > 0
let persistTimer: ReturnType<typeof setTimeout> | null = null

function notify(): void {
  listeners.forEach((listener) => listener())
}

function persistNow(next: PortalState): void {
  if (!persistEnabled) return
  const disk = loadMergedState()
  if (contentScore(next) === 0 && contentScore(disk) > 0) return
  saveRawMyLlmState(JSON.stringify(next))
}

function schedulePersist(next: PortalState): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow(next)
  }, 50)
}

export function getMyLlmState(): PortalState {
  return state
}

export function subscribeMyLlmState(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function rehydrateMyLlmState(): void {
  const loaded = loadMergedState()
  const merged = mergeLoadedStates([state, loaded])
  persistEnabled = true
  if (JSON.stringify(merged) === JSON.stringify(state)) return
  state = merged
  notify()
}

export function updateMyLlmState(
  patch: Partial<PortalState> | ((current: PortalState) => PortalState),
): PortalState {
  const nextBase = typeof patch === 'function' ? patch(state) : { ...state, ...patch }
  const next: PortalState = { ...nextBase, updatedAt: Date.now() }
  state = next
  schedulePersist(next)
  notify()
  return next
}

export function flushMyLlmState(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persistNow(state)
}

if (typeof window !== 'undefined') {
  const flush = () => flushMyLlmState()
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
}
