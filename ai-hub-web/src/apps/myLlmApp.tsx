import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '../components/Icon'
import { useAuth } from '../auth/AuthContext'
import type { AppContext, AppPlugin } from './types'
import { TENCENT_PROVIDERS, enabledTencentModels, type TencentProviderId } from '../lib/tencentCatalog'
import { findTencentModel, getTencentSettings, subscribeTencentSettings } from '../lib/tencentSettings'
import { tencentComplete } from '../lib/tencentClient'
import { appendIoLog } from '../lib/ioLog'
import type { ChatMessage } from '../lib/openaiClient'
import {
  MODES,
  getMyLlmState,
  rehydrateMyLlmState,
  subscribeMyLlmState,
  updateMyLlmState,
  type ChatThread,
  type EngineId,
  type Message,
  type PaneSide,
  type PaneState,
  type SendTarget,
} from './myLlmStore'
import { consumeMyAiUsage, getMyAiUsage, type AiUserUsage } from '../lib/aiUsageService'
import {
  exportToDocx, exportToTxt,
  exportToPdf,
  exportToImage,
  extractPdfText, type PdfExtractResult,
  makeResponseFilename,
} from '../lib/exportDocument'
import { addNotification } from '../lib/notificationService'
import DocumentGeneratorModal from '../components/DocumentGeneratorModal'
import MarkdownDocViewer from '../components/MarkdownDocViewer'

type Engine = {
  id: EngineId
  name: string
  accent: string
  capabilities: string[]
}

type Attachment = {
  id: string
  name: string
  size: number
  type: string
  content: string        // 파일 텍스트 내용 (이미지는 data:URL, PDF는 추출 텍스트)
  isPdf?: boolean        // PDF에서 추출된 텍스트 여부
  pdfPageCount?: number  // PDF 페이지 수
}

const T = {
  appName: '\uB098\uB9CC\uC758 LLM',
  title: '\uB098\uB9CC\uC758 LLM',
  subtitle:
    '\uD558\uB098\uC758 \uC9C8\uBB38\uC744 \uC591\uCABD\uC5D0 \uB3D9\uC2DC\uC5D0 \uBCF4\uB0B4\uAC70\uB098, \uB9C8\uC74C\uC5D0 \uB4DC\uB294 \uCABD\uB9CC \uC120\uD0DD\uD574 \uC774\uC5B4\uAC11\uB2C8\uB2E4. \uB2F5\uBCC0\uC740 \uC2DC\uC2A4\uD15C \uC624\uB298 \uB0A0\uC9DC\uC640 \uC6F9 \uAC80\uC0C9\uC744 \uBC18\uC601\uD569\uB2C8\uB2E4.',
  screen: '\uD654\uBA74',
  both: '\uC591\uCABD',
  left: '\uC67C\uCABD',
  right: '\uC624\uB978\uCABD',
  addFile: '\uD30C\uC77C \uCD94\uAC00',
  send: '\uC9C8\uBB38 \uC804\uC1A1',
  clearInput: '\uC785\uB825 \uC9C0\uC6B0\uAE30',
  clearChat: '\uB300\uD654 \uC9C0\uC6B0\uAE30',
  resetHistory: '\uCD08\uAE30\uD654',
  prevChats: '\uC774\uC804 \uB300\uD654',
  noChats:
    '\uC800\uC7A5\uB41C \uB300\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC9C8\uBB38\uC744 \uBCF4\uB0B4\uBA74 \uB85C\uCEEC \uC800\uC7A5\uC18C\uC5D0 \uB300\uD654\uAC00 \uB0A8\uC2B5\uB2C8\uB2E4.',
  start: '\uB300\uD654\uB97C \uC2DC\uC791\uD558\uC138\uC694.',
  startHint:
    '\uC544\uB798 \uACF5\uD1B5 \uC785\uB825\uCC3D\uC5D0\uC11C \uC804\uC1A1 \uB300\uC0C1\uC744 \uBC14\uAFFF \uC9C8\uBB38\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
  placeholderBoth:
    '\uC591\uCABD \uD654\uBA74\uC5D0 \uBCF4\uB0BC \uC9C8\uBB38\uC744 \uC785\uB825\uD558\uC138\uC694.',
  placeholderLeft:
    '\uC67C\uCABD \uD654\uBA74\uC5D0 \uBCF4\uB0BC \uC9C8\uBB38\uC744 \uC785\uB825\uD558\uC138\uC694.',
  placeholderRight:
    '\uC624\uB978\uCABD \uD654\uBA74\uC5D0 \uBCF4\uB0BC \uC9C8\uBB38\uC744 \uC785\uB825\uD558\uC138\uC694.',
  balance: '\uB0B4 \uC0AC\uC6A9 \uAC00\uB2A5\uC561',
  adminUsage: '\uAD00\uB9AC\uC790 \uC0AC\uC6A9\uB7C9',
  remaining: '\uC794\uC5EC \uD134',
  used: '\uC0AC\uC6A9',
  total: '\uC804\uCCB4',
  charge: '\uCDA9\uC804',
  requestTurns: '\uD305 \uCD94\uAC00 \uC694\uCCAD',
}

const MAX_CHAT_SLOTS = 20

const ENGINE_ACCENTS: Record<string, string> = {
  chatgpt: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  openai: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  claude: 'border-amber-300 bg-amber-50 text-amber-900',
  gemini: 'border-sky-300 bg-sky-50 text-sky-900',
  grok: 'border-rose-300 bg-rose-50 text-rose-900',
  deepseek: 'border-cyan-300 bg-cyan-50 text-cyan-900',
  glm: 'border-orange-300 bg-orange-50 text-orange-900',
  kimi: 'border-violet-300 bg-violet-50 text-violet-900',
  minimax: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900',
  perplexity: 'border-violet-300 bg-violet-50 text-violet-900',
}

const ENGINES: Engine[] = TENCENT_PROVIDERS.map((provider) => ({
  id: provider.id === 'openai' ? 'chatgpt' : provider.id,
  name: provider.name,
  accent: ENGINE_ACCENTS[provider.id] ?? 'border-outline-variant bg-surface-container-high text-on-surface',
  capabilities: ['text'],
}))

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function providerOf(engine: EngineId): TencentProviderId {
  if (engine === 'chatgpt') return 'openai'
  if (engine === 'perplexity') return 'kimi'
  return engine
}

function getEngine(id: EngineId): Engine {
  const normalized: EngineId = id === 'perplexity' ? 'kimi' : id
  return ENGINES.find((engine) => engine.id === normalized) ?? ENGINES[0]
}

function getEngineModels(engine: EngineId): string[] {
  const provider = providerOf(engine)
  return enabledTencentModels(getTencentSettings().models)
    .filter((model) => model.provider === provider)
    .map((model) => model.id)
}

function getConfiguredModel(engine: EngineId): string {
  return getEngineModels(engine)[0] ?? ''
}

function availableEngines(): Engine[] {
  return ENGINES.filter((engine) => getEngineModels(engine.id).length > 0)
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

// ─── 턴 소진 모달 ─────────────────────────────────────────────────────────────
function TurnExhaustedModal({
  onClose,
  onRequest,
}: {
  onClose: () => void
  onRequest: () => void
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-surface border border-outline-variant shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10">
            <Icon name="block" className="text-error text-[22px]" />
          </div>
          <h2 className="font-h2 text-h2 text-on-surface">턴 소진</h2>
        </div>
        <p className="text-body-sm text-on-surface-variant mb-6 leading-relaxed">
          이번 달 사용 가능한 <span className="font-semibold text-on-surface">AI 턴을 모두 소진</span>했습니다.
          <br />
          매달 1일에 자동으로 초기화됩니다. 지금 바로 필요하시면 관리자에게 추가 턴을 요청하세요.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-outline-variant bg-surface-container px-4 py-2.5 font-label text-label text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onRequest}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-label text-label text-on-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name="send" className="text-[16px]" />
            관리자에게 요청
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 관리자 요청 모달 (내부 알림으로 전송) ──────────────────────────────────────
function RequestTurnsModal({
  onClose,
  session,
}: {
  onClose: () => void
  session: { email: string; displayName: string; userId?: string } | null
}) {
  const [message, setMessage] = useState('')
  const [requestedTurns, setRequestedTurns] = useState('')
  const [sent, setSent] = useState(false)

  const handleSend = () => {
    if (!session) return
    addNotification({
      type: 'turn_request',
      userId: session.userId ?? session.email,
      userName: session.displayName,
      userEmail: session.email,
      appId: 'my-llm',
      appName: '나만의 LLM',
      subject: `[턴 추가 요청] ${session.displayName}`,
      message: message.trim() || '추가 턴을 요청합니다.',
      requestedTurns: Number(requestedTurns) || undefined,
    })
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-surface border border-outline-variant shadow-xl p-6">
        {sent ? (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                <Icon name="check_circle" className="text-success text-[28px]" />
              </div>
              <p className="font-h3 text-h3 text-on-surface">요청이 전송되었습니다</p>
              <p className="text-body-sm text-on-surface-variant text-center">
                관리자의 알림에 전달되었습니다. 확인 후 턴을 추가해 드릴 예정입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 font-label text-label text-on-primary hover:bg-primary/90"
            >
              닫기
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Icon name="token" className="text-primary text-[22px]" />
              </div>
              <h2 className="font-h2 text-h2 text-on-surface">관리자에게 턴 요청</h2>
            </div>
            <p className="text-caption text-on-surface-variant mb-3">
              요청 내용이 관리자 알림으로 즉시 전달됩니다.
            </p>
            <div className="mb-3">
              <label className="block text-caption text-on-surface-variant mb-1">요청 턴 수 (선택)</label>
              <input
                type="number"
                min={1}
                value={requestedTurns}
                onChange={(e) => setRequestedTurns(e.target.value)}
                placeholder="예: 1000"
                className="w-full h-9 rounded-lg border border-outline-variant bg-surface-container px-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="추가 턴이 필요한 이유를 간단히 설명해 주세요."
              className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-outline-variant bg-surface-container px-4 py-2.5 font-label text-label text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSend}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-label text-label text-on-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <Icon name="send" className="text-[16px]" />
                요청 전송
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Word 문서 뷰어 모달 ─────────────────────────────────────────────────────
function DocViewerModal({
  content,
  engineName,
  model,
  onClose,
}: {
  content: string
  engineName: string
  model: string
  onClose: () => void
}) {
  // 문서 제목 추출 (첫 번째 # 헤딩 or 첫 줄)
  const docTitle = content.match(/^#\s+(.+)/m)?.[1]?.trim()
    ?? content.split('\n').find(l => l.trim())?.slice(0, 50)
    ?? 'AI 응답'

  const [isFullscreen, setIsFullscreen] = useState(false)

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className={`flex flex-col bg-white shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'fixed inset-2 rounded-xl'
            : 'relative w-full max-w-[780px] max-h-[92vh] rounded-2xl'
        }`}
        style={{ border: '1px solid #d1d5db' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 타이틀 바 (Word 스타일) ── */}
        <div style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px' }}
          className="shrink-0 flex items-center gap-3">
          <Icon name="description" className="text-[18px] text-blue-200" />
          <span className="text-body-sm font-semibold truncate flex-1">{docTitle}</span>
          <span className="text-caption text-blue-200 hidden sm:block shrink-0">DOCX</span>
          {/* 다운로드 버튼들 */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void exportToDocx(content, makeResponseFilename(content))}
              className="h-7 w-7 rounded flex items-center justify-center text-blue-200 hover:bg-white/20 hover:text-white transition-colors"
              title=".docx 다운로드"
            >
              <Icon name="download" className="text-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => void exportToPdf(content, makeResponseFilename(content))}
              className="h-7 w-7 rounded flex items-center justify-center text-blue-200 hover:bg-white/20 hover:text-white transition-colors"
              title=".pdf 다운로드"
            >
              <Icon name="picture_as_pdf" className="text-[17px]" />
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(f => !f)}
              className="h-7 w-7 rounded flex items-center justify-center text-blue-200 hover:bg-white/20 hover:text-white transition-colors"
              title={isFullscreen ? '원래 크기' : '전체화면'}
            >
              <Icon name={isFullscreen ? 'close_fullscreen' : 'open_in_full'} className="text-[17px]" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 rounded flex items-center justify-center text-blue-200 hover:bg-red-500 hover:text-white transition-colors"
              title="닫기"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>

        {/* ── 문서 메타 (엔진 + 모델) ── */}
        <div style={{ background: '#f8f9fa', borderBottom: '1px solid #e5e7eb', padding: '5px 16px' }}
          className="shrink-0 flex items-center gap-3">
          <Icon name="smart_toy" className="text-[13px] text-primary" />
          <span className="text-[11px] text-on-surface-variant">{engineName} · {model}</span>
          <span className="ml-auto text-[10px] text-on-surface-variant/60">
            {new Date().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>

        {/* ── 문서 본문 (A4 스타일 패딩) ── */}
        <div className="custom-scrollbar flex-1 min-h-0 overflow-auto"
          style={{ background: '#fff', padding: '32px 48px' }}>
          <MarkdownDocViewer content={content} />
        </div>

        {/* ── 하단 상태바 ── */}
        <div style={{ background: '#1e3a5f', color: '#93c5fd', padding: '3px 14px' }}
          className="shrink-0 flex items-center gap-4 text-[11px]">
          <span>EBS AI 허브</span>
          <span className="opacity-60">·</span>
          <span>{content.split('\n').length}줄 · {content.length.toLocaleString()}자</span>
        </div>
      </div>
    </div>
  )
}

export function MyLlmBody({ isAdmin }: AppContext) {
  const { session } = useAuth()
  const portalState = useSyncExternalStore(subscribeMyLlmState, getMyLlmState, getMyLlmState)
  const {
    layoutMode,
    sendTarget,
    sharedInput,
    leftPane,
    rightPane,
    activeThreadId,
  } = portalState
  const [sharedAttachments, setSharedAttachments] = useState<Attachment[]>([])
  const [sending, setSending] = useState(false)
  const [settingsTick, setSettingsTick] = useState(0)
  const [aiUsage, setAiUsage] = useState<AiUserUsage | null>(null)
  const [showExhaustedModal, setShowExhaustedModal] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)
  const [expandedMessage, setExpandedMessage] = useState<{ content: string; engineName: string; model: string } | null>(null)
  // 패널별 인라인 후속 질문 입력 상태
  const [inlineInput, setInlineInput] = useState<{ left: string; right: string }>({ left: '', right: '' })
  const [inlineSending, setInlineSending] = useState<{ left: boolean; right: boolean }>({ left: false, right: false })
  const sharedFileInputRef = useRef<HTMLInputElement>(null)
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)

  const effectiveTarget: SendTarget = sendTarget

  // 턴 사용량 로드
  useEffect(() => {
    void getMyAiUsage().then(setAiUsage)
  }, [session?.userId])

  const turnUsed = aiUsage?.usedThisMonth ?? 0
  const turnLimit = aiUsage?.monthlyLimit ?? 5000
  const turnRemaining = Math.max(turnLimit - turnUsed, 0)
  const usageRate = Math.min((turnUsed / Math.max(turnLimit, 1)) * 100, 100)

  const selectedThreads = portalState.threads.filter((thread) =>
    portalState.selectedContextIds.includes(thread.id),
  )

  useEffect(() => {
    rehydrateMyLlmState()
  }, [session?.userId, session?.email])

  useEffect(() => subscribeTencentSettings(() => setSettingsTick((value) => value + 1)), [])

  useEffect(() => {
    const engines = availableEngines()
    if (engines.length === 0) return
    const syncPane = (current: PaneState): PaneState => {
      const engine = engines.some((item) => item.id === current.engine) ? current.engine : engines[0].id
      const models = getEngineModels(engine)
      if (models.length === 0) return current
      const model = models.includes(current.model) ? current.model : (models[0] ?? current.model)
      if (engine === current.engine && model === current.model) return current
      return { ...current, engine, model }
    }
    const nextLeft = syncPane(getMyLlmState().leftPane)
    const nextRight = syncPane(getMyLlmState().rightPane)
    if (nextLeft === getMyLlmState().leftPane && nextRight === getMyLlmState().rightPane) return
    updateMyLlmState((current) => ({
      ...current,
      leftPane: syncPane(current.leftPane),
      rightPane: syncPane(current.rightPane),
    }))
  }, [settingsTick])


  // 메시지가 추가될 때 각 패널의 스크롤을 최신 메시지로 이동
  useEffect(() => {
    leftScrollRef.current?.scrollTo({ top: leftScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [leftPane.messages])

  useEffect(() => {
    rightScrollRef.current?.scrollTo({ top: rightScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [rightPane.messages])

  const updatePane = (side: PaneSide, patch: Partial<PaneState>) => {
    updateMyLlmState((current) => {
      const pane = side === 'left' ? current.leftPane : current.rightPane
      const next = { ...pane, ...patch }
      if (patch.engine && !getEngineModels(patch.engine).includes(next.model)) {
        next.model = getConfiguredModel(patch.engine)
      }
      return side === 'left' ? { ...current, leftPane: next } : { ...current, rightPane: next }
    })
  }

  const saveThread = (pane: PaneState, messages: Message[]) => {
    if (messages.length === 0) return
    const firstUser = messages.find((message) => message.role === 'user')?.content ?? 'New chat'
    const thread: ChatThread = {
      id: makeId('thread'),
      title: firstUser.slice(0, 42),
      engine: pane.engine,
      model: pane.model,
      updatedAt: new Date().toISOString(),
      messages,
    }
    updateMyLlmState((current) => ({
      ...current,
      threads: [thread, ...current.threads].slice(0, MAX_CHAT_SLOTS),
      activeThreadId: thread.id,
    }))
  }

  const buildChatMessages = (
    pane: PaneState,
    messages: Message[],
    question: string,
  ): ChatMessage[] => {
    const selectedContext = selectedThreads
      .flatMap((thread) => thread.messages.slice(-6))
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n')
    const attachmentBlock =
      sharedAttachments.length > 0
        ? '\n\n' + sharedAttachments
            .map((file) => {
              const header = `[첨부파일: ${file.name} (${file.type}, ${formatSize(file.size)})]`
              if (file.content.startsWith('data:image/')) {
                return `${header}\n(이미지 파일 — 텍스트 추출 불가)`
              }
              return `${header}\n${file.content}`
            })
            .join('\n\n')
        : ''

    // 모드별 시스템 프롬프트 선택
    const modeSystemContent = (() => {
      const base = `You are ${getEngine(pane.engine).name} inside EBS AI 허브. Answer in Korean unless explicitly asked otherwise.`
      if (pane.mode === 'document summary') {
        return (
          base +
          ' You are a professional document writing assistant. ' +
          'When answering, always structure your response as a well-formatted Word document using Markdown: ' +
          'Use # for the main title, ## for section headers (numbered like "1. 개요", "2. 현황" etc.), ' +
          '### for subsections, **bold** for key terms, ' +
          '- bullet lists for enumerations, and | table | format | for data comparisons. ' +
          'Include a brief metadata line after the title (e.g., "작성 기준일: ... · 자료 출처: ..."). ' +
          'The document must be thorough, professional, and ready to use as-is. ' +
          'Do NOT include download links or instructions — just produce the document content.'
        )
      }
      if (pane.mode === 'data analysis') {
        return (
          base +
          ' Structure your analysis as a document with: title (#), summary section (##), ' +
          'data tables (using Markdown tables), key findings as numbered sections, ' +
          'and a conclusion section. Use **bold** for critical values.'
        )
      }
      if (pane.mode === 'planning review') {
        return (
          base +
          ' Format your response as a structured planning document with numbered sections, ' +
          'action items as bullet lists, and summary tables where appropriate. ' +
          'Use Markdown headings and bold for emphasis.'
        )
      }
      return base + ` Current mode: ${pane.mode}. Be useful and concise.`
    })()

    return [
      {
        role: 'system',
        content: modeSystemContent,
      },
      ...(selectedContext
        ? [
            {
              role: 'system' as const,
              content: `Selected previous chat context:\n${selectedContext}`,
            },
          ]
        : []),
      ...messages.slice(-20).map(
        (message) =>
          ({
            role: message.role,
            content: message.content,
          }) as ChatMessage,
      ),
      { role: 'user', content: `${question}${attachmentBlock}` },
    ]
  }

  const sendToPaneWithProviders = async (side: PaneSide, question: string) => {
    const pane = side === 'left' ? leftPane : rightPane
    const now = new Date().toISOString()
    // 첨부파일 내용을 user 메시지 content에 포함해 히스토리에 영구 저장
    const attachmentBlock =
      sharedAttachments.length > 0
        ? '\n\n' + sharedAttachments
            .map((file) => {
              const header = `[첨부파일: ${file.name} (${file.type}, ${formatSize(file.size)})]`
              if (file.content.startsWith('data:image/')) return `${header}\n(이미지 파일)`
              return `${header}\n${file.content}`
            })
            .join('\n\n')
        : ''
    const userMessage: Message = {
      id: makeId('msg'),
      role: 'user',
      content: question + attachmentBlock,
      createdAt: now,
    }
    const pendingMessages = [...pane.messages, userMessage]
    updatePane(side, { messages: pendingMessages })

    const chatMessages = buildChatMessages(pane, pane.messages, question)
    const selected = findTencentModel(pane.model)
    let content: string
    let liveNow: string | undefined
    let sources: Message['sources']
    if (!selected?.apiUrl) {
      content =
        'ADMIN 설정에서 사용할 모델을 활성화한 뒤 다시 시도하세요. 꺼져 있는 모델은 선택할 수 없습니다.'
      appendIoLog({
        direction: 'error',
        channel: 'ui',
        title: `${side} 모델 없음  engine=${pane.engine} model=${pane.model}`,
        body: content,
      })
    } else {
      const res = await tencentComplete(chatMessages, { model: selected.id, apiUrl: selected.apiUrl })
      content = res.ok ? res.content : res.error
      if (res.ok) {
        liveNow = res.live?.now
        sources = res.live?.sources
      }
    }

    const assistantMessage: Message = {
      id: makeId('msg'),
      role: 'assistant',
      engine: pane.engine,
      model: pane.model,
      content,
      createdAt: new Date().toISOString(),
      liveNow,
      sources,
    }
    const nextMessages = [...pendingMessages, assistantMessage]
    updatePane(side, { messages: nextMessages })
    saveThread(pane, nextMessages)
  }

  // ── 인라인 후속 질문 전송 (특정 패널에만) ─────────────────────────────────
  const sendInline = async (side: PaneSide) => {
    const question = inlineInput[side].trim()
    if (!question || inlineSending[side]) return

    const consumeResult = await consumeMyAiUsage(1)
    if (!consumeResult.ok) {
      setShowExhaustedModal(true)
      return
    }
    void getMyAiUsage().then(setAiUsage)

    setInlineInput((prev) => ({ ...prev, [side]: '' }))
    setInlineSending((prev) => ({ ...prev, [side]: true }))
    try {
      await sendToPaneWithProviders(side, question)
    } finally {
      setInlineSending((prev) => ({ ...prev, [side]: false }))
      void getMyAiUsage().then(setAiUsage)
    }
  }

  const send = async () => {
    const question = sharedInput.trim()
    if (!question || sending) return

    // 턴 소비 확인
    const consumeResult = await consumeMyAiUsage(1)
    if (!consumeResult.ok) {
      setShowExhaustedModal(true)
      return
    }

    // 사용량 갱신
    void getMyAiUsage().then(setAiUsage)

    const targets: PaneSide[] =
      effectiveTarget === 'both' ? ['left', 'right'] : [effectiveTarget]
    appendIoLog({
      direction: 'cmd',
      channel: 'ui',
      title: `질문 전송  target=${targets.join(',')}  left=${leftPane.engine}/${leftPane.model}  right=${rightPane.engine}/${rightPane.model}`,
      body: [
        question,
        sharedAttachments.length > 0
          ? `첨부: ${sharedAttachments.map((file) => `${file.name} (${formatSize(file.size)})`).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    })
    updateMyLlmState({ sharedInput: '' })
    setSharedAttachments([])
    setSending(true)
    try {
      await Promise.all(targets.map((target) => sendToPaneWithProviders(target, question)))
    } finally {
      setSending(false)
      // 전송 완료 후 사용량 재갱신
      void getMyAiUsage().then(setAiUsage)
    }
  }

  const onSharedFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const isImage = file.type.startsWith('image/')

      if (isPdf) {
        // PDF → pdfjs-dist로 텍스트 추출
        void extractPdfText(file).then((result: PdfExtractResult) => {
          const attachment: Attachment = {
            id: makeId('file'),
            name: file.name,
            size: file.size,
            type: 'application/pdf',
            content: result.text,
            isPdf: true,
            pdfPageCount: result.pageCount,
          }
          setSharedAttachments((current) => [...current, attachment].slice(0, 8))
        }).catch(() => {
          // PDF 추출 실패 시 빈 텍스트로 추가
          const attachment: Attachment = {
            id: makeId('file'),
            name: file.name,
            size: file.size,
            type: 'application/pdf',
            content: '[PDF 텍스트 추출 실패 — 스캔 PDF이거나 보호된 파일일 수 있습니다]',
            isPdf: true,
          }
          setSharedAttachments((current) => [...current, attachment].slice(0, 8))
        })
      } else {
        const reader = new FileReader()
        reader.onload = (event) => {
          const content = (event.target?.result as string) ?? ''
          const attachment: Attachment = {
            id: makeId('file'),
            name: file.name,
            size: file.size,
            type: file.type || 'unknown',
            content,
          }
          setSharedAttachments((current) => [...current, attachment].slice(0, 8))
        }
        if (isImage) {
          reader.readAsDataURL(file)
        } else {
          reader.readAsText(file, 'utf-8')
        }
      }
    })
    if (sharedFileInputRef.current) sharedFileInputRef.current.value = ''
  }

  const loadThreadToPane = (thread: ChatThread, side: PaneSide) => {
    updatePane(side, {
      engine: thread.engine,
      model: thread.model,
      messages: thread.messages,
    })
    updateMyLlmState({ activeThreadId: thread.id })
  }

  const toggleContext = (threadId: string) => {
    updateMyLlmState((current) => {
      const exists = current.selectedContextIds.includes(threadId)
      const selectedContextIds = exists
        ? current.selectedContextIds.filter((id) => id !== threadId)
        : [...current.selectedContextIds, threadId].slice(-MAX_CHAT_SLOTS)
      return { ...current, selectedContextIds }
    })
  }

  const deleteThread = (threadId: string) => {
    updateMyLlmState((current) => ({
      ...current,
      threads: current.threads.filter((thread) => thread.id !== threadId),
      selectedContextIds: current.selectedContextIds.filter((id) => id !== threadId),
      activeThreadId: current.activeThreadId === threadId ? null : current.activeThreadId,
    }))
  }

  const resetHistory = () => {
    if (portalState.threads.length === 0) return
    if (!window.confirm('이전 대화를 모두 삭제할까요?')) return
    updateMyLlmState((current) => ({
      ...current,
      threads: [],
      selectedContextIds: [],
      activeThreadId: null,
    }))
  }

  const clearPane = (side: PaneSide) => {
    updatePane(side, { messages: [] })
  }

  const renderPane = (pane: PaneState, side: PaneSide) => {
    const engine = getEngine(pane.engine)
    const engines = availableEngines()
    const modelOptions = getEngineModels(pane.engine)
    const active = effectiveTarget === 'both' || effectiveTarget === side
    return (
      <section
        className={`min-h-0 flex flex-col rounded-lg border bg-surface-container overflow-hidden ${
          active ? 'border-primary/60 shadow-sm' : 'border-outline-variant'
        }`}
      >
        <div className="shrink-0 border-b border-outline-variant bg-surface-container-high px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-caption font-semibold ${active ? 'bg-primary text-on-primary' : 'bg-white text-on-surface-variant border border-outline-variant'}`}>
              {side === 'left' ? T.left : T.right}
            </span>
            <select
              value={engines.some((item) => item.id === pane.engine) ? pane.engine : engines[0]?.id ?? ''}
              onChange={(event) => updatePane(side, { engine: event.target.value as EngineId })}
              disabled={engines.length === 0}
              className="no-drag h-9 rounded-lg border-outline-variant bg-white text-body-sm disabled:opacity-50"
              aria-label="engine"
            >
              {engines.length === 0 ? (
                <option value="">활성화된 제공사 없음</option>
              ) : (
                engines.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
            <select
              value={modelOptions.includes(pane.model) ? pane.model : modelOptions[0] ?? ''}
              onChange={(event) => updatePane(side, { model: event.target.value })}
              disabled={modelOptions.length === 0}
              className="no-drag h-9 min-w-[150px] rounded-lg border-outline-variant bg-white text-body-sm disabled:opacity-50"
              aria-label="model"
            >
              {modelOptions.length === 0 ? (
                <option value="">활성화된 모델 없음</option>
              ) : (
                modelOptions.map((model) => {
                  const item = findTencentModel(model)
                  return (
                    <option key={model} value={model}>
                      {item?.label ?? model}
                    </option>
                  )
                })
              )}
            </select>
            <select
              value={pane.mode}
              onChange={(event) => updatePane(side, { mode: event.target.value })}
              className="no-drag h-9 rounded-lg border-outline-variant bg-white text-body-sm"
              aria-label="mode"
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            {/* 대화 지우기 버튼 */}
            <div className="no-drag ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => clearPane(side)}
                disabled={pane.messages.length === 0}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant bg-white px-2.5 text-caption text-on-surface-variant hover:text-error hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-40"
                title={T.clearChat}
              >
                <Icon name="delete_sweep" className="text-[17px]" />
                {T.clearChat}
              </button>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-caption ${engine.accent}`}>
              {engine.capabilities.slice(0, 3).join(' · ')}
            </span>
          </div>
        </div>

        <div ref={side === 'left' ? leftScrollRef : rightScrollRef} className="custom-scrollbar flex-1 min-h-0 overflow-auto p-3 space-y-3">
          {pane.messages.length === 0 ? (
            <div className="h-full min-h-0 flex flex-col items-center justify-center text-center text-on-surface-variant">
              <Icon name="forum" className="text-[30px] text-primary mb-2" />
              {modelOptions.length === 0 ? (
                <>
                  <p className="text-body-sm">활성화된 모델이 없습니다.</p>
                  <p className="text-caption">ADMIN 설정에서 사용할 모델을 켠 뒤 저장하세요.</p>
                </>
              ) : (
                <>
                  <p className="text-body-sm">{engine.name} {T.start}</p>
                  <p className="text-caption">{T.startHint}</p>
                </>
              )}
            </div>
          ) : (
            pane.messages.map((message, msgIdx) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}
              >
                <div
                  className={`relative rounded-lg text-body-sm ${
                    message.role === 'user'
                      ? 'max-w-[88%] px-3 py-2 bg-primary text-on-primary whitespace-pre-wrap break-words'
                      : 'w-full bg-white border border-outline-variant text-on-surface overflow-hidden'
                  }`}
                >
                  {/* AI 응답: Word 문서 스타일 렌더링 */}
                  {message.role === 'assistant' ? (
                    <div>
                      {/* 문서 타이틀 바 */}
                      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-outline-variant/50"
                        style={{ background: '#f8f9fa' }}>
                        <Icon name="description" className="text-[13px] text-primary/70" />
                        <span className="text-[11px] text-on-surface-variant font-medium truncate flex-1">
                          {message.content.match(/^#\s+(.+)/m)?.[1]?.trim()
                            ?? message.content.split('\n').find(l => l.trim())?.slice(0, 60)
                            ?? 'AI 응답'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedMessage({
                            content: message.content,
                            engineName: getEngine(message.engine ?? pane.engine).name,
                            model: message.model ?? pane.model,
                          })}
                          className="no-drag h-6 px-2 rounded text-[10px] text-on-surface-variant hover:bg-primary/10 hover:text-primary flex items-center gap-0.5 transition-colors shrink-0"
                          title="문서 뷰어로 열기"
                        >
                          <Icon name="open_in_full" className="text-[12px]" />
                          문서 보기
                        </button>
                      </div>
                      {/* 문서 내용 — 전체 표시 */}
                      <div className="px-4 py-3">
                        <MarkdownDocViewer content={message.content} />
                      </div>
                    </div>
                  ) : (
                    message.content
                  )}
                  {/* AI 응답: 액션 버튼 바 */}
                  {message.role === 'assistant' && (
                    <>
                      {/* 액션 버튼 바 */}
                      <div className="px-3 py-1.5 border-t border-outline-variant/30 flex items-center gap-1 flex-wrap"
                        style={{ background: '#f8f9fa' }}>
                        <span className="text-[10px] text-on-surface-variant/60 mr-auto">
                          {getEngine(message.engine ?? pane.engine).name} · {message.model ?? pane.model}
                        </span>
                        {/* 문서 뷰어 */}
                        <button
                          type="button"
                          onClick={() => setExpandedMessage({
                            content: message.content,
                            engineName: getEngine(message.engine ?? pane.engine).name,
                            model: message.model ?? pane.model,
                          })}
                          className="no-drag inline-flex items-center gap-1 rounded border border-outline-variant bg-white px-2 py-0.5 text-[11px] text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                          title="문서 뷰어로 열기"
                        >
                          <Icon name="open_in_full" className="text-[12px]" />
                          문서
                        </button>
                      <button
                        type="button"
                        onClick={() => void exportToDocx(message.content, makeResponseFilename(message.content))}
                        className="no-drag inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-2 py-0.5 text-[11px] text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        title="이 응답을 Word(.docx)로 저장"
                      >
                        <Icon name="description" className="text-[13px]" />
                        .docx
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportToPdf(message.content, makeResponseFilename(message.content))}
                        className="no-drag inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-2 py-0.5 text-[11px] text-on-surface-variant hover:text-error/80 hover:border-error/40 hover:bg-error/5 transition-colors"
                        title="이 응답을 PDF로 저장"
                      >
                        <Icon name="picture_as_pdf" className="text-[13px]" />
                        .pdf
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportToImage(message.content, makeResponseFilename(message.content))}
                        className="no-drag inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-2 py-0.5 text-[11px] text-on-surface-variant hover:text-emerald-700 hover:border-emerald-400/40 hover:bg-emerald-50 transition-colors"
                        title="이 응답을 이미지(.png)로 저장"
                      >
                        <Icon name="image" className="text-[13px]" />
                        .png
                      </button>
                      <button
                        type="button"
                        onClick={() => exportToTxt(message.content, makeResponseFilename(message.content))}
                        className="no-drag inline-flex items-center gap-1 rounded-md border border-outline-variant bg-white px-2 py-0.5 text-[11px] text-on-surface-variant hover:text-on-surface hover:border-outline hover:bg-surface-container-high transition-colors"
                        title="이 응답을 텍스트(.txt)로 저장"
                      >
                        <Icon name="text_snippet" className="text-[13px]" />
                        .txt
                      </button>
                      </div>
                    </>
                  )}

                  {/* ── 인라인 후속 질문 입력창 (AI 응답 하단) ── */}
                  {message.role === 'assistant' && (
                    <div className="px-3 pb-3 pt-1" style={{ background: '#fafafa' }}>
                      {/* 마지막 메시지이거나 이미 입력 중이면 바로 표시, 아니면 접혀 있음 */}
                      {(msgIdx === pane.messages.length - 1 || inlineInput[side] !== '') ? (
                        <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-2.5 py-1.5 shadow-sm">
                          <Icon name="subdirectory_arrow_right" className="text-[15px] text-on-surface-variant/50 shrink-0" />
                          <textarea
                            value={inlineInput[side]}
                            onChange={(e) => setInlineInput((p) => ({ ...p, [side]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void sendInline(side)
                              }
                            }}
                            rows={1}
                            placeholder="이어서 질문하기… (Enter 전송, Shift+Enter 줄바꿈)"
                            className="no-drag flex-1 resize-none bg-transparent text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
                            style={{ minHeight: 24, maxHeight: 120, overflowY: 'auto' }}
                          />
                          <button
                            type="button"
                            onClick={() => void sendInline(side)}
                            disabled={!inlineInput[side].trim() || inlineSending[side] || turnRemaining === 0}
                            className="no-drag shrink-0 h-7 w-7 rounded-lg bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors"
                            title="전송"
                          >
                            <Icon
                              name={inlineSending[side] ? 'progress_activity' : 'send'}
                              className={`text-[15px] ${inlineSending[side] ? 'animate-spin' : ''}`}
                            />
                          </button>
                        </div>
                      ) : (
                        /* 이전 메시지: 접힌 상태 — hover 시 "이어서 질문" 버튼 표시 */
                        <button
                          type="button"
                          onClick={() => setInlineInput((p) => ({ ...p, [side]: ' ' }))}
                          className="no-drag w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-outline-variant/50 py-1 text-[11px] text-on-surface-variant/40 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Icon name="add_comment" className="text-[13px]" />
                          이어서 질문
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="no-drag h-full min-h-0 flex flex-col gap-3">
      {/* ── 상단 헤더: 타이틀 + 턴 패널을 한 줄로 ── */}
      <div className="shrink-0 rounded-lg border border-outline-variant bg-surface-container px-4 py-2.5 flex items-center gap-4">
        {/* 왼쪽: 타이틀 */}
        <div className="min-w-0 shrink-0">
          <h3 className="font-h2 text-h2 text-on-surface leading-tight">{T.title}</h3>
          <p className="text-caption text-on-surface-variant leading-tight">{T.subtitle}</p>
        </div>

        {/* 구분선 */}
        <div className="w-px self-stretch bg-outline-variant shrink-0" />

        {/* 오른쪽: 턴 현황 가로 레이아웃 */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {/* 레이블 + % */}
          <div className="shrink-0 flex items-center gap-1.5">
            <Icon name="token" className="text-[14px] text-on-surface-variant" />
            <span className="text-caption font-semibold text-on-surface-variant whitespace-nowrap">
              {isAdmin ? T.adminUsage : T.balance}
            </span>
            <span
              className={`text-caption font-bold ${usageRate >= 90 ? 'text-error' : usageRate >= 70 ? 'text-warning' : 'text-primary'}`}
            >
              {Math.round(usageRate)}%
            </span>
          </div>

          {/* 프로그레스 바 */}
          <div className="flex-1 h-2 rounded-full bg-surface-container-highest overflow-hidden min-w-[60px]">
            <div
              className={`h-full transition-all ${usageRate >= 90 ? 'bg-error' : usageRate >= 70 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${usageRate}%` }}
            />
          </div>

          {/* 전체 / 사용 / 잔여 수치 */}
          {[
            { label: T.total, value: turnLimit.toLocaleString() },
            { label: T.used, value: turnUsed.toLocaleString() },
            { label: T.remaining, value: turnRemaining.toLocaleString() },
          ].map((item) => (
            <div key={item.label} className="shrink-0 rounded-lg bg-surface-container-high px-2.5 py-1 text-center">
              <div className="text-[10px] text-on-surface-variant leading-none">{item.label}</div>
              <div className="text-caption font-semibold text-on-surface leading-snug">{item.value}</div>
            </div>
          ))}

          {/* 리셋 안내 */}
          <span className="shrink-0 text-[10px] text-on-surface-variant/60 hidden lg:block whitespace-nowrap">
            매달 1일 초기화
          </span>

          {/* Admin: 충전 / User: 요청 버튼 */}
          {isAdmin ? (
            <div className="shrink-0 flex items-center gap-1">
              <input
                type="number"
                defaultValue={turnLimit}
                onBlur={async (e) => {
                  const { setUserAiLimit } = await import('../lib/aiUsageService')
                  const { getCurrentUserStorageId } = await import('../lib/userScopedStorage')
                  const userId = getCurrentUserStorageId()
                  await setUserAiLimit(userId, Number(e.target.value))
                  void getMyAiUsage().then(setAiUsage)
                }}
                className="no-drag h-7 w-20 rounded-lg border-outline-variant text-caption"
                aria-label="monthly turn limit"
              />
              <button
                type="button"
                onClick={async () => {
                  const { setUserAiLimit } = await import('../lib/aiUsageService')
                  const { getCurrentUserStorageId } = await import('../lib/userScopedStorage')
                  const userId = getCurrentUserStorageId()
                  await setUserAiLimit(userId, turnLimit + 1000)
                  void getMyAiUsage().then(setAiUsage)
                }}
                className="no-drag h-7 rounded-lg border border-outline-variant bg-white px-2 text-caption text-primary whitespace-nowrap"
              >
                {T.charge}
              </button>
            </div>
          ) : (
            turnRemaining === 0 && (
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="no-drag shrink-0 h-7 rounded-lg bg-primary/10 border border-primary/30 text-primary text-caption font-medium px-2.5 flex items-center gap-1 hover:bg-primary/20 transition-colors whitespace-nowrap"
              >
                <Icon name="mail" className="text-[13px]" />
                {T.requestTurns}
              </button>
            )
          )}
        </div>
      </div>

      {/* ── 메인 콘텐츠 영역 ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[240px_1fr] gap-3">
        {/* ── 이전 대화 사이드바 (Claude/ChatGPT 스타일) ── */}
        <aside className="min-h-0 rounded-lg border border-outline-variant bg-surface-container flex flex-col overflow-hidden">
          {/* 사이드바 헤더 */}
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-outline-variant">
            <div className="flex items-center gap-1.5">
              <Icon name="history" className="text-[16px] text-on-surface-variant" />
              <span className="font-h3 text-h3 text-on-surface">{T.prevChats}</span>
              <span className="rounded-full bg-surface-container-highest text-on-surface-variant/70 text-[10px] px-1.5 py-0.5">
                {portalState.threads.length}
              </span>
            </div>
            <button
              type="button"
              onClick={resetHistory}
              disabled={portalState.threads.length === 0}
              className="no-drag h-7 w-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={T.resetHistory}
            >
              <Icon name="delete_sweep" className="text-[17px]" />
            </button>
          </div>

          {/* 맥락 선택 배지 */}
          {selectedThreads.length > 0 && (
            <div className="shrink-0 px-3 py-2 border-b border-outline-variant bg-primary/5">
              <p className="text-[10px] font-semibold text-primary mb-1.5 uppercase tracking-wide">맥락으로 사용 중</p>
              <div className="flex flex-wrap gap-1">
                {selectedThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => toggleContext(thread.id)}
                    className="no-drag inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] text-primary hover:bg-error/10 hover:text-error hover:border-error/20 transition-colors"
                  >
                    {thread.title.slice(0, 14)}{thread.title.length > 14 ? '…' : ''}
                    <Icon name="close" className="text-[10px]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 대화 목록 */}
          <div className="custom-scrollbar min-h-0 flex-1 overflow-auto py-1">
            {portalState.threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-on-surface-variant px-3">
                <Icon name="chat_bubble_outline" className="text-[28px] opacity-40" />
                <p className="text-caption">{T.noChats}</p>
              </div>
            ) : (
              (() => {
                // 날짜 기준으로 그룹핑
                const today = new Date()
                const groups: { label: string; threads: typeof portalState.threads }[] = []
                const grouped = new Map<string, typeof portalState.threads>()

                for (const thread of portalState.threads) {
                  const d = new Date(thread.updatedAt)
                  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
                  let label: string
                  if (diffDays === 0) label = '오늘'
                  else if (diffDays === 1) label = '어제'
                  else if (diffDays <= 7) label = '이번 주'
                  else if (diffDays <= 30) label = '이번 달'
                  else label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`

                  if (!grouped.has(label)) { grouped.set(label, []); groups.push({ label, threads: [] }) }
                  grouped.get(label)!.push(thread)
                }
                for (const g of groups) g.threads = grouped.get(g.label) ?? []

                return groups.map(({ label, threads: groupThreads }) => (
                  <div key={label}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider sticky top-0 bg-surface-container">
                      {label}
                    </div>
                    {groupThreads.map((thread) => (
                      <div
                        key={thread.id}
                        className={`group relative flex items-center gap-1 px-2 py-1.5 mx-1 rounded-lg cursor-pointer transition-colors ${
                          activeThreadId === thread.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {/* 맥락 체크 (좌측 점/아이콘) */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleContext(thread.id) }}
                          className={`no-drag shrink-0 h-5 w-5 flex items-center justify-center rounded transition-colors ${
                            portalState.selectedContextIds.includes(thread.id)
                              ? 'text-primary'
                              : 'text-transparent group-hover:text-on-surface-variant/40 hover:!text-primary'
                          }`}
                          title="맥락으로 사용"
                        >
                          <Icon
                            name={portalState.selectedContextIds.includes(thread.id) ? 'check_circle' : 'radio_button_unchecked'}
                            className="text-[14px]"
                          />
                        </button>

                        {/* 대화 제목 — 클릭 시 현재 활성 패널에 로드 */}
                        <button
                          type="button"
                          onClick={() => loadThreadToPane(thread, layoutMode === 2 ? effectiveTarget === 'right' ? 'right' : 'left' : 'left')}
                          className="no-drag min-w-0 flex-1 text-left py-0.5"
                        >
                          <div className="truncate text-body-sm leading-snug">
                            {thread.title}
                          </div>
                          <div className="text-[10px] text-on-surface-variant/50 mt-0.5">
                            {(() => {
                              const d = new Date(thread.updatedAt)
                              return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                            })()}
                            {layoutMode === 2 && (
                              <span className={`ml-1.5 rounded px-1 text-[9px] font-medium ${
                                activeThreadId === thread.id ? 'bg-primary/20 text-primary' : 'bg-surface-container-highest text-on-surface-variant/60'
                              }`}>
                                {effectiveTarget === 'right' ? T.right : T.left}에 열림
                              </span>
                            )}
                          </div>
                        </button>

                        {/* 2화면 모드: 오른쪽으로 열기 버튼 (hover 시만 표시) */}
                        {layoutMode === 2 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); loadThreadToPane(thread, 'right') }}
                            className="no-drag shrink-0 h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-on-surface-variant/50 hover:bg-surface-container-highest hover:text-primary transition-all"
                            title={`${T.right}에 열기`}
                          >
                            <Icon name="arrow_forward" className="text-[13px]" />
                          </button>
                        )}

                        {/* 삭제 버튼 (hover 시만 표시) */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteThread(thread.id) }}
                          className="no-drag shrink-0 h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-all"
                          aria-label="delete chat"
                        >
                          <Icon name="close" className="text-[13px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              })()
            )}
          </div>
        </aside>

        <div className={`min-h-0 grid gap-3 ${layoutMode === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
          {layoutMode === 2 ? (
            <>
              {renderPane(leftPane, 'left')}
              {renderPane(rightPane, 'right')}
            </>
          ) : effectiveTarget === 'right' ? (
            renderPane(rightPane, 'right')
          ) : (
            renderPane(leftPane, 'left')
          )}
        </div>
      </div>

      {/* ── 하단 입력 영역 ── */}
      <div className="shrink-0 rounded-lg border border-outline-variant bg-surface-container px-3 pt-2 pb-2.5">
        <input
          ref={sharedFileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.docx,.doc,.xlsx,.xls"
          className="hidden"
          onChange={(event) => onSharedFiles(event.target.files)}
        />

        {/* ── 1행: 도구 버튼 바 ── */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* 파일 첨부 */}
          <button
            type="button"
            onClick={() => sharedFileInputRef.current?.click()}
            className="no-drag h-8 shrink-0 rounded-lg border border-outline-variant bg-white text-on-surface-variant hover:text-primary hover:bg-surface-container-highest flex items-center justify-center gap-1 px-2.5"
            aria-label={T.addFile}
            title={T.addFile}
          >
            <Icon name="attach_file" className="text-[16px]" />
            <span className="text-caption hidden sm:inline">파일</span>
          </button>

          {/* 첨부 파일 칩 (파일 첨부 버튼 바로 옆) */}
          {sharedAttachments.map((file) => (
            <span
              key={file.id}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-caption ${
                file.isPdf
                  ? 'border-error/30 bg-error/5 text-error'
                  : file.type.startsWith('image/')
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-outline-variant bg-white text-on-surface-variant'
              }`}
            >
              <Icon
                name={file.isPdf ? 'picture_as_pdf' : file.type.startsWith('image/') ? 'image' : 'attach_file'}
                className="text-[13px]"
              />
              <span className="max-w-[120px] truncate">{file.name}</span>
              {file.pdfPageCount && <span className="text-[10px] opacity-70">{file.pdfPageCount}p</span>}
              <button
                type="button"
                className="no-drag ml-0.5 text-on-surface-variant hover:text-error"
                onClick={() =>
                  setSharedAttachments((current) => current.filter((item) => item.id !== file.id))
                }
                aria-label="remove file"
              >
                <Icon name="close" className="text-[12px]" />
              </button>
            </span>
          ))}

          {/* 구분선 */}
          <div className="w-px h-5 bg-outline-variant mx-0.5 shrink-0" />

          {/* 화면 수 선택 */}
          <div className="shrink-0 inline-flex rounded-lg border border-outline-variant bg-white p-0.5">
            {[1, 2].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const next = value as 1 | 2
                  updateMyLlmState({ layoutMode: next, sendTarget: portalState.sendTarget })
                }}
                className={`no-drag h-7 px-2 rounded text-caption font-medium ${
                  layoutMode === value ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {T.screen}{value}
              </button>
            ))}
          </div>

          {/* 전송 대상 선택 */}
          <div className="shrink-0 inline-flex rounded-lg border border-outline-variant bg-white p-0.5">
            {(['both', 'left', 'right'] as SendTarget[]).map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => updateMyLlmState({ sendTarget: target })}
                disabled={layoutMode === 1 && target === 'both'}
                className={`no-drag h-7 px-2 rounded text-caption font-medium disabled:opacity-40 ${
                  effectiveTarget === target ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {target === 'both' ? T.both : target === 'left' ? T.left : T.right}
              </button>
            ))}
          </div>

          {/* 구분선 */}
          <div className="w-px h-5 bg-outline-variant mx-0.5 shrink-0" />

          {/* 문서 생성 버튼 */}
          <button
            type="button"
            onClick={() => setShowDocModal(true)}
            className="no-drag h-8 shrink-0 rounded-lg border border-outline-variant bg-white text-on-surface-variant hover:text-primary hover:bg-primary/5 flex items-center justify-center gap-1 px-2.5"
            title="AI 문서 생성"
          >
            <Icon name="auto_awesome" className="text-[16px]" />
            <span className="text-caption hidden sm:inline">문서</span>
          </button>

          {/* 잔여 턴 (오른쪽 정렬) */}
          <span className="ml-auto shrink-0 flex items-center gap-1 text-caption text-on-surface-variant/70 whitespace-nowrap">
            <Icon name="token" className="text-[13px]" />
            {turnRemaining > 0
              ? `${turnRemaining.toLocaleString()}턴 남음`
              : <span className="text-error font-medium">턴 소진</span>}
          </span>
        </div>

        {/* ── 2행: 텍스트 입력 + 전송 + 초기화 ── */}
        <div className="flex items-end gap-1.5">
          {/* 텍스트 입력창 (크게) */}
          <textarea
            value={sharedInput}
            onChange={(event) => updateMyLlmState({ sharedInput: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={3}
            placeholder={
              effectiveTarget === 'both'
                ? T.placeholderBoth
                : effectiveTarget === 'left'
                  ? T.placeholderLeft
                  : T.placeholderRight
            }
            className="no-drag flex-1 min-h-[72px] max-h-[200px] resize-y rounded-lg border border-outline-variant bg-white px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
          />

          {/* 전송 버튼 */}
          <button
            type="button"
            onClick={() => void send()}
            disabled={!sharedInput.trim() || sending || turnRemaining === 0}
            className="no-drag h-10 w-10 shrink-0 rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
            aria-label={sending ? '답변 중' : T.send}
            title={sending ? '답변 중' : turnRemaining === 0 ? '턴을 모두 소진했습니다' : T.send}
          >
            <Icon
              name={sending ? 'progress_activity' : 'send'}
              className={`text-[20px] ${sending ? 'animate-spin' : ''}`}
            />
          </button>

          {/* 입력 초기화 버튼 */}
          <button
            type="button"
            onClick={() => updateMyLlmState({ sharedInput: '' })}
            disabled={!sharedInput}
            className="no-drag h-10 w-10 shrink-0 rounded-lg border border-outline-variant bg-white text-on-surface-variant hover:text-error disabled:opacity-50 flex items-center justify-center"
            aria-label={T.clearInput}
            title={T.clearInput}
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
      </div>

      {/* ── 모달 ── */}
      {showExhaustedModal && (
        <TurnExhaustedModal
          onClose={() => setShowExhaustedModal(false)}
          onRequest={() => {
            setShowExhaustedModal(false)
            setShowRequestModal(true)
          }}
        />
      )}
      {showRequestModal && (
        <RequestTurnsModal
          onClose={() => setShowRequestModal(false)}
          session={session}
        />
      )}
      {showDocModal && (
        <DocumentGeneratorModal onClose={() => setShowDocModal(false)} />
      )}
      {expandedMessage && (
        <DocViewerModal
          content={expandedMessage.content}
          engineName={expandedMessage.engineName}
          model={expandedMessage.model}
          onClose={() => setExpandedMessage(null)}
        />
      )}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const myLlmApp: AppPlugin = {
  id: 'my-llm',
  name: T.appName,
  icon: 'hub',
  description: 'Tencent API로 GPT, Claude, Gemini, Grok 등 모델을 선택해 대화합니다.',
  category: 'AI',
  version: '1.0.0',
  defaultSize: { w: 12, h: 7, minW: 6, minH: 5 },
  defaultInstalled: true,
  defaultActive: true,
  bodyClassName: '!p-3',
  Body: MyLlmBody,
}
