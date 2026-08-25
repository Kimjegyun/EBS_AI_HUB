import { useState, useEffect, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import GridLayout from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useAuth } from '../auth/AuthContext'
import { useAppCatalog } from '../context/AppCatalogContext'
import { useEnvironmentConfig } from '../context/EnvironmentConfigContext'
import { Icon } from '../components/Icon'
import { APP_MAP, DEFAULT_ACTIVE } from '../apps/registry'
import type { AppContext } from '../apps/types'
import {
  getUserScopedItem,
  removeUserScopedItem,
  setUserScopedItem,
} from '../lib/userScopedStorage'
import {
  getPortalScopedItem,
  removePortalScopedItem,
  setPortalScopedItem,
} from '../lib/portalStorage'
import { useIsMobile } from '../hooks/useIsMobile'

const LAYOUTS_KEY = 'dashboard-layouts'
const GRID_HEIGHT_KEY = 'dashboard-grid-height'
const GRID_WIDTH_KEY = 'dashboard-grid-width'
const MAXIMIZED_KEY = 'dashboard-maximized-widget'
const GRID_COLS = 12
const GRID_ROW_HEIGHT = 92
const DEFAULT_GRID_WIDTH = 1200

type SnapPreset = {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
}

function collides(a: Layout, b: Layout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function intervalOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

function clampLayoutItem(item: Layout, cols: number): Layout {
  const minW = item.minW ?? 1
  const minH = item.minH ?? 1
  const w = Math.min(Math.max(item.w, minW), cols)
  const h = Math.max(item.h, minH)
  return {
    ...item,
    x: Math.min(Math.max(0, item.x), cols - w),
    y: Math.max(0, item.y),
    w,
    h,
  }
}

function findFirstGap(item: Layout, placed: Layout[], cols: number): Layout {
  const base = clampLayoutItem(item, cols)
  for (let y = 0; y < 240; y++) {
    for (let x = 0; x <= cols - base.w; x++) {
      const candidate = { ...base, x, y }
      if (!placed.some((other) => collides(candidate, other))) return candidate
    }
  }
  const y = placed.reduce((max, other) => Math.max(max, other.y + other.h), 0)
  return { ...base, x: 0, y }
}

function closeColumnGaps(items: Layout[], cols: number): Layout[] {
  if (items.length === 0) return items

  const occupied = Array.from({ length: cols }, () => false)
  for (const item of items) {
    for (let col = item.x; col < item.x + item.w && col < cols; col++) {
      if (col >= 0) occupied[col] = true
    }
  }

  const gapsBefore = Array.from({ length: cols + 1 }, () => 0)
  for (let col = 0; col < cols; col++) {
    gapsBefore[col + 1] = gapsBefore[col] + (occupied[col] ? 0 : 1)
  }

  const closed = items.map((item) =>
    clampLayoutItem({ ...item, x: item.x - gapsBefore[item.x] }, cols),
  )
  const maxRight = Math.max(...closed.map((item) => item.x + item.w))
  const fill = cols - maxRight
  if (fill <= 0) return closed

  return closed.map((item) =>
    item.x + item.w === maxRight ? clampLayoutItem({ ...item, w: item.w + fill }, cols) : item,
  )
}

function preserveFreeLayout(items: Layout[], cols: number): Layout[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Layout[] = []
  for (const item of sorted) {
    const clamped = clampLayoutItem(item, cols)
    placed.push(
      placed.some((other) => collides(clamped, other))
        ? findFirstGap(clamped, placed, cols)
        : clamped,
    )
  }
  return placed
}

function alignTopLeft(items: Layout[], cols: number): Layout[] {
  return closeColumnGaps(packRow(items, cols), cols)
}

// Pack items to the left so no widget is stranded against the right edge with
// empty columns to its left. This lets a lone/edge widget grow rightward freely.
function compactLeft(items: Layout[], cols: number): Layout[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Layout[] = []
  for (const it of sorted) {
    const w = Math.min(Math.max(it.w, it.minW ?? 1), cols)
    const y = Math.max(0, it.y)
    const vOverlap = (p: Layout) => y < p.y + p.h && y + it.h > p.y
    let x = 0
    for (;;) {
      const blockers = placed.filter((p) => vOverlap(p) && x < p.x + p.w && x + w > p.x)
      if (blockers.length === 0) break
      const nextX = Math.max(...blockers.map((p) => p.x + p.w))
      if (nextX + w > cols) break
      x = nextX
    }
    placed.push({ ...it, x, y, w })
  }
  return placed
}

// Pull every widget upward as far as it can go without colliding, so nothing is
// ever stranded below an empty gap — the grid always packs to the top edge.
function compactVertical(items: Layout[]): Layout[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Layout[] = []
  for (const it of sorted) {
    const item = { ...it, y: Math.max(0, it.y), h: Math.max(it.h, it.minH ?? 1) }
    const collidesAt = (y: number) =>
      placed.some(
        (p) => item.x < p.x + p.w && item.x + item.w > p.x && y < p.y + p.h && y + item.h > p.y,
      )
    let y = 0
    while (collidesAt(y)) y++
    placed.push({ ...item, y })
  }
  return placed
}

// Full top-left normalisation: pack left, pull up, then stretch the last widget
// in each row to fill the width — no empty space at the top-left or right edge.
function packRow(items: Layout[], cols: number): Layout[] {
  const sorted = compactVertical(compactLeft(items, cols)).sort((a, b) => a.y - b.y || a.x - b.x)
  const packed: Layout[] = []
  let x = 0
  let y = 0
  let rowH = 0

  for (const item of sorted) {
    const w = Math.min(Math.max(item.w, item.minW ?? 1), cols)
    const h = Math.max(item.h, item.minH ?? 1)
    if (x > 0 && x + w > cols) {
      y += rowH
      x = 0
      rowH = 0
    }
    packed.push({ ...item, x, y, w, h })
    x += w
    rowH = Math.max(rowH, h)
  }

  const rows = new Map<number, Layout[]>()
  for (const item of packed) {
    const row = rows.get(item.y) ?? []
    row.push(item)
    rows.set(item.y, row)
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x)
    const last = row[row.length - 1]
    const fill = cols - (last.x + last.w)
    if (fill > 0) last.w += fill
  }
  return packed
}

function normalizeLayouts<T extends Record<string, Layout[]>>(ls: T): T {
  const out: Record<string, Layout[]> = {}
  for (const [bp, items] of Object.entries(ls)) {
    out[bp] = alignTopLeft(items ?? [], GRID_COLS)
  }
  return out as T
}

function repairIdleLayouts<T extends Record<string, Layout[]>>(ls: T): T {
  const out: Record<string, Layout[]> = {}
  for (const [bp, items] of Object.entries(ls)) {
    out[bp] = preserveFreeLayout(items ?? [], GRID_COLS)
  }
  return out as T
}

function getSnapPreset(
  rect: DOMRect,
  item: Layout,
  clientX: number,
  clientY: number,
  rowHeight: number,
): SnapPreset | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null
  }

  const rx = (clientX - rect.left) / rect.width
  const ry = (clientY - rect.top) / rect.height
  const visibleRows = Math.max(6, Math.floor(rect.height / rowHeight))
  const minW = item.minW ?? 1
  const minH = item.minH ?? 1
  const snapW = Math.min(GRID_COLS, Math.max(6, minW))
  const snapHalfH = Math.max(Math.floor(visibleRows / 2), minH)
  const snapSide = rx >= 0.5 ? 'right' : 'left'
  const snapBand = ry < 1 / 3 ? 'top' : ry > 2 / 3 ? 'bottom' : 'full'
  const snapX = snapSide === 'right' ? GRID_COLS - snapW : 0
  const snapY = snapBand === 'bottom' ? Math.max(0, visibleRows - snapHalfH) : 0
  const snapH = snapBand === 'full' ? Math.max(visibleRows, minH) : snapHalfH
  const snapLabel =
    snapSide === 'left'
      ? snapBand === 'top'
        ? '왼쪽 상단'
        : snapBand === 'bottom'
          ? '왼쪽 하단'
          : '왼쪽 상하단'
      : snapBand === 'top'
        ? '오른쪽 상단'
        : snapBand === 'bottom'
          ? '오른쪽 하단'
          : '오른쪽 상하단'

  return {
    id: `${snapSide}-${snapBand}`,
    label: snapLabel,
    x: snapX,
    y: snapY,
    w: snapW,
    h: snapH,
  }
  const presetW = Math.min(GRID_COLS, Math.max(6, minW))
  const presetH = Math.max(Math.floor(visibleRows / 2), minH)
  const presetX = rx >= 0.5 ? GRID_COLS - presetW : 0
  const presetY = ry >= 0.5 ? Math.max(0, visibleRows - presetH) : 0
  const presetCol = rx >= 0.5 ? 'right' : 'left'
  const presetRow = ry >= 0.5 ? 'bottom' : 'top'
  const presetLabel =
    presetRow === 'top'
      ? presetCol === 'left'
        ? '좌상단 1/4'
        : '우상단 1/4'
      : presetCol === 'left'
        ? '좌하단 1/4'
        : '우하단 1/4'
  return {
    id: `${presetRow}-${presetCol}`,
    label: presetLabel,
    x: presetX,
    y: presetY,
    w: presetW,
    h: presetH,
  }
  const halfW = Math.max(6, minW)
  const halfH = Math.max(Math.floor(visibleRows / 2), minH)
  const centerH = Math.max(Math.min(visibleRows - 1, 5), minH)
  const bottomY = Math.max(0, visibleRows - halfH)
  const centerY = Math.max(0, Math.floor((visibleRows - centerH) / 2))

  const col = rx < 0.26 ? 'left' : rx > 0.74 ? 'right' : 'center'
  const row = ry < 0.30 ? 'top' : ry > 0.70 ? 'bottom' : 'middle'

  if (row === 'middle' && col === 'left') return { id: 'left-half', label: '왼쪽 1/2', x: 0, y: 0, w: halfW, h: visibleRows }
  if (row === 'middle' && col === 'right') return { id: 'right-half', label: '오른쪽 1/2', x: GRID_COLS - halfW, y: 0, w: halfW, h: visibleRows }
  if (row === 'top' && col === 'center') return { id: 'top-half', label: '위쪽 1/2', x: 0, y: 0, w: GRID_COLS, h: halfH }
  if (row === 'bottom' && col === 'center') return { id: 'bottom-half', label: '아래쪽 1/2', x: 0, y: bottomY, w: GRID_COLS, h: halfH }
  if (row === 'middle' && col === 'center') return { id: 'center', label: '중앙', x: 3, y: centerY, w: Math.max(6, minW), h: centerH }

  const x = col === 'right' ? GRID_COLS - halfW : 0
  const y = row === 'bottom' ? bottomY : 0
  const label = `${row === 'top' ? '위' : '아래'} ${col === 'left' ? '왼쪽' : '오른쪽'} 1/4`
  return { id: `${row}-${col}`, label, x, y, w: halfW, h: halfH }
}

function applySnapPreset(layout: Layout[], itemId: string, preset: SnapPreset): Layout[] {
  const target = layout.find((item) => item.i === itemId)
  if (!target) return preserveFreeLayout(layout, GRID_COLS)

  const minW = target.minW ?? 1
  const minH = target.minH ?? 1
  const w = Math.min(Math.max(preset.w, minW), GRID_COLS)
  const snapped = clampLayoutItem(
    {
      ...target,
      x: preset.x,
      y: preset.y,
      w,
      h: Math.max(preset.h, minH),
    },
    GRID_COLS,
  )

  const placed: Layout[] = [snapped]
  const others = layout
    .filter((item) => item.i !== itemId)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  for (const item of others) {
    placed.push(findFirstGap(item, placed, GRID_COLS))
  }
  return preserveFreeLayout(placed, GRID_COLS)
}

void getSnapPreset
void applySnapPreset

// Guarantee every active widget has a layout entry (and drop entries for
// inactive widgets). Newly added widgets get appended at the bottom. This keeps
// RGL fully controlled — no reliance on `data-grid` — so resizes stick. Single
// 12-column layout (one breakpoint) keeps RGL, the linked-resize logic and
// persistence in agreement regardless of window width, then fills each row to
// full width so there's never an empty gap on the right.
function buildLayouts(
  base: Record<string, Layout[]>,
  active: string[],
): Record<string, Layout[]> {
  const existing = (base.lg ?? [])
    .filter((it) => active.includes(it.i))
    // Keep position/size; sync min constraints to the registry ONLY when they
    // differ, so unchanged items keep their object identity (otherwise RGL sees
    // a "new" layout every render and resets an in-progress resize/drag).
    .map((it) => {
      const def = APP_MAP[it.i]
      if (!def) return it
      const w = Math.max(it.w, def.defaultSize.minW)
      const h = Math.max(it.h, def.defaultSize.minH)
      if (
        it.minW !== def.defaultSize.minW ||
        it.minH !== def.defaultSize.minH ||
        it.w !== w ||
        it.h !== h
      ) {
        return { ...it, w, h, minW: def.defaultSize.minW, minH: def.defaultSize.minH }
      }
      return it
    })
  const present = new Set(existing.map((it) => it.i))
  let y = existing.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  const added: Layout[] = []
  for (const id of active) {
    if (present.has(id)) continue
    const def = APP_MAP[id]
    if (!def) continue
    added.push({
      i: id,
      x: 0,
      y,
      w: def.defaultSize.w,
      h: def.defaultSize.h,
      minW: def.defaultSize.minW,
      minH: def.defaultSize.minH,
    })
    y += def.defaultSize.h
  }
  return { lg: [...existing, ...added] }
}

// Initial layout for the default-active apps on a fresh account.
const defaultLayouts: Record<string, Layout[]> = {
  lg: [
    { i: 'quick-actions', x: 0, y: 0, w: 12, h: 2, minW: 4, minH: 2 },
    { i: 'calendar', x: 0, y: 2, w: 6, h: 5, minW: 3, minH: 3 },
    { i: 'pending-tasks', x: 6, y: 2, w: 6, h: 5, minW: 3, minH: 2 },
    { i: 'codex', x: 0, y: 7, w: 12, h: 5, minW: 3, minH: 3 },
  ],
}

function loadStoredLayouts(): Record<string, Layout[]> {
  const savedLayouts = getPortalScopedItem(LAYOUTS_KEY) ?? getUserScopedItem(LAYOUTS_KEY)
  if (!savedLayouts) return defaultLayouts

  try {
    return repairIdleLayouts(JSON.parse(savedLayouts))
  } catch (err) {
    console.error('Failed to load saved layouts:', err)
    return defaultLayouts
  }
}

function loadStoredGridHeight(): number {
  const raw = getPortalScopedItem(GRID_HEIGHT_KEY) ?? getUserScopedItem(GRID_HEIGHT_KEY)
  const value = raw ? Number(raw) : 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

function loadStoredGridWidth(): number {
  const raw = getPortalScopedItem(GRID_WIDTH_KEY) ?? getUserScopedItem(GRID_WIDTH_KEY)
  const value = raw ? Number(raw) : 0
  if (Number.isFinite(value) && value > 0) return value
  if (typeof window !== 'undefined') return Math.max(320, window.innerWidth - 24)
  return DEFAULT_GRID_WIDTH
}

function loadStoredMaximizedWidget(): string | null {
  const raw = getPortalScopedItem(MAXIMIZED_KEY) ?? getUserScopedItem(MAXIMIZED_KEY)
  if (!raw || !APP_MAP[raw]) return null
  return raw
}

function persistMaximizedWidget(id: string | null): void {
  if (id) {
    setUserScopedItem(MAXIMIZED_KEY, id)
    setPortalScopedItem(MAXIMIZED_KEY, id)
    return
  }
  removeUserScopedItem(MAXIMIZED_KEY)
  removePortalScopedItem(MAXIMIZED_KEY)
}

/** Card chrome shared by widgets: drag handle header + top-left close button. */
function WidgetFrame({
  icon,
  title,
  onClose,
  extra,
  children,
  bodyClassName,
  maximized,
  onToggleMaximize,
}: {
  icon: string
  title: string
  onClose: () => void
  extra?: ReactNode
  children: ReactNode
  bodyClassName?: string
  maximized?: boolean
  onToggleMaximize?: () => void
}) {
  const lastHeaderMouseDownRef = useRef(0)
  const suppressNativeDoubleClickRef = useRef(false)

  const isInteractiveHeaderTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest('button, a, input, select, textarea'))

  // The whole header is BOTH a drag handle (move the widget) AND a double-click
  // target (maximize/restore). We detect the double-click from `mousedown`
  // timing instead of the native `dblclick`, because react-grid-layout treats a
  // tiny mouse movement during a double-click as a drag and suppresses the
  // native dblclick. mousedown always fires first, so this stays reliable while
  // keeping full drag freedom from anywhere on the header.
  const handleHeaderMouseDownCapture = (e: React.MouseEvent) => {
    if (!onToggleMaximize || isInteractiveHeaderTarget(e.target)) return

    const now = window.performance.now()
    if (now - lastHeaderMouseDownRef.current <= 320) {
      e.preventDefault()
      e.stopPropagation()
      suppressNativeDoubleClickRef.current = true
      lastHeaderMouseDownRef.current = 0
      onToggleMaximize()
      return
    }

    lastHeaderMouseDownRef.current = now
  }

  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    if (!onToggleMaximize) return
    if (isInteractiveHeaderTarget(e.target)) return
    if (suppressNativeDoubleClickRef.current) {
      suppressNativeDoubleClickRef.current = false
      return
    }
    e.preventDefault()
    e.stopPropagation()
    onToggleMaximize()
  }

  return (
    <div className="h-full flex flex-col bg-surface-container rounded-xl border border-outline-variant shadow-sm overflow-hidden">
      {/* Grab anywhere on the header to drag-move; double-click to maximize. */}
      <div
        className={`${maximized ? 'cursor-zoom-out' : 'drag-handle cursor-grab active:cursor-grabbing'} select-none flex items-center justify-between gap-2 px-2 py-1 border-b border-outline-variant hover:bg-surface-container-high transition-colors`}
        title={maximized ? '더블클릭하여 원래 크기로' : '드래그하여 이동 · 더블클릭하여 최대화'}
        onMouseDownCapture={handleHeaderMouseDownCapture}
        onDoubleClick={handleHeaderDoubleClick}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            title="대시보드에서 제거"
            aria-label="대시보드에서 제거"
            className="no-drag relative z-40 shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
          >
            <Icon name="close" className="text-[15px]" />
          </button>
          <Icon name={icon} className="text-primary shrink-0 text-[16px]" />
          <h2 className="text-label font-semibold text-on-surface truncate">{title}</h2>
        </div>
        <div className="relative z-40 flex items-center gap-1.5 shrink-0">
          {extra}
          {onToggleMaximize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleMaximize()
              }}
              title={maximized ? '원래 크기로' : '최대화'}
              aria-label={maximized ? '원래 크기로' : '최대화'}
              className="no-drag shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-primary transition-colors"
            >
              <Icon name={maximized ? 'close_fullscreen' : 'open_in_full'} className="text-[16px]" />
            </button>
          )}
          {!maximized && (
            <Icon
              name="drag_indicator"
              className="drag-handle cursor-grab active:cursor-grabbing text-on-surface-variant text-[18px]"
            />
          )}
        </div>
      </div>
      <div className={`flex-1 min-h-0 overflow-auto p-4 ${bodyClassName ?? ''}`}>{children}</div>
    </div>
  )
}

export default function DashboardPage() {
  const { session, isAdmin } = useAuth()
  const { activeIds, installedIds, loading: catalogLoading, replaceActiveApps } = useAppCatalog()
  const isMobile = useIsMobile()
  const { config: envConfig } = useEnvironmentConfig()
  const greetName = session?.displayName ?? '사용자'
  const publicTitle = envConfig.service_display_name

  const storageUserKey = session?.userId ?? session?.email ?? 'anonymous'

  const [layouts, setLayouts] = useState<Record<string, Layout[]>>(() => loadStoredLayouts())
  const activeWidgets = activeIds
  const [maximizedWidget, setMaximizedWidget] = useState<string | null>(() => loadStoredMaximizedWidget())
  const [activeSnapPreset, setActiveSnapPreset] = useState<SnapPreset | null>(null)
  const [gridHeight, setGridHeight] = useState(() => loadStoredGridHeight())
  const [gridWidth, setGridWidth] = useState(() => loadStoredGridWidth())
  const [isResizing, setIsResizing] = useState(false)
  const gridViewportRef = useRef<HTMLDivElement | null>(null)
  const layoutsReadyRef = useRef(false)
  const ignoreLayoutPersistRef = useRef(true)
  const layoutBeforeMaximizeRef = useRef<Record<string, Layout[]> | null>(null)

  const cloneLayouts = (source: Record<string, Layout[]>): Record<string, Layout[]> =>
    Object.fromEntries(
      Object.entries(source).map(([bp, items]) => [bp, items.map((item) => ({ ...item }))]),
    ) as Record<string, Layout[]>

  const persistLayouts = (next: Record<string, Layout[]>) => {
    const raw = JSON.stringify(next)
    setUserScopedItem(LAYOUTS_KEY, raw)
    setPortalScopedItem(LAYOUTS_KEY, raw)
    return next
  }

  const restoreLayoutBeforeMaximize = () => {
    const snapshot = layoutBeforeMaximizeRef.current
    if (!snapshot) return

    const restored = cloneLayouts(snapshot)
    layoutBeforeMaximizeRef.current = null
    setLayouts(persistLayouts(restored))
  }

  useEffect(() => {
    const node = gridViewportRef.current
    if (!node) return

    const updateHeight = () => {
      const nextHeight = node.clientHeight
      const nextWidth = node.clientWidth
      if (nextHeight > 0) {
        setGridHeight(nextHeight)
        setUserScopedItem(GRID_HEIGHT_KEY, String(nextHeight))
        setPortalScopedItem(GRID_HEIGHT_KEY, String(nextHeight))
      }
      if (nextWidth > 0) {
        setGridWidth(nextWidth)
        setUserScopedItem(GRID_WIDTH_KEY, String(nextWidth))
        setPortalScopedItem(GRID_WIDTH_KEY, String(nextWidth))
      }
    }
    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => window.removeEventListener('resize', updateHeight)
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Load saved layouts + active widgets from localStorage. Activation/deactivation
  // is managed from the "설치된 앱" page; we re-read on mount so the dashboard
  // reflects the latest choices.
  useEffect(() => {
    ignoreLayoutPersistRef.current = true
    layoutsReadyRef.current = false
    setLayouts(loadStoredLayouts())
    setGridHeight(loadStoredGridHeight())
    setGridWidth(loadStoredGridWidth())
    setMaximizedWidget(loadStoredMaximizedWidget())
    layoutsReadyRef.current = true
    const frame = window.requestAnimationFrame(() => {
      ignoreLayoutPersistRef.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [storageUserKey])

  // Reconcile layout entries whenever the active widget set changes: ensure each
  // active widget has an entry (newly activated ones get appended) and drop
  // entries for deactivated widgets. We keep RGL's own layout objects untouched
  // for unchanged widgets so an in-progress resize/drag is never reset.
  useEffect(() => {
    if (!layoutsReadyRef.current) return
    setLayouts((prev) => buildLayouts(prev, activeWidgets))
  }, [activeWidgets])

  useEffect(() => {
    if (catalogLoading) return
    persistMaximizedWidget(maximizedWidget)
  }, [catalogLoading, maximizedWidget])

  useEffect(() => {
    if (catalogLoading || activeWidgets.length === 0) return
    if (maximizedWidget && !activeWidgets.includes(maximizedWidget)) {
      setMaximizedWidget(null)
    }
  }, [activeWidgets, maximizedWidget, catalogLoading])

  useEffect(() => {
    if (!maximizedWidget) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        restoreLayoutBeforeMaximize()
        setMaximizedWidget(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximizedWidget])

  const toggleWidgetMaximized = (id: string) => {
    if (maximizedWidget === id) {
      restoreLayoutBeforeMaximize()
      setMaximizedWidget(null)
      return
    }

    setLayouts((prev) => {
      const stable = repairIdleLayouts(prev)
      layoutBeforeMaximizeRef.current = cloneLayouts(stable)
      return persistLayouts(stable)
    })
    setMaximizedWidget(id)
  }

  const persistActive = (ids: string[]) => {
    replaceActiveApps(ids)
  }

  const removeWidget = (id: string) => {
    setMaximizedWidget((cur) => (cur === id ? null : cur))
    persistActive(activeWidgets.filter((w) => w !== id))
    // Prune the removed widget from the layout, then left-pack so the remaining
    // widgets aren't stranded against the right edge (lets them grow right).
    const pruned = Object.fromEntries(
      Object.entries(layouts).map(([bp, items]) => [bp, items.filter((it) => it.i !== id)]),
    ) as Record<string, Layout[]>
    const next = normalizeLayouts(pruned)
    setLayouts(persistLayouts(next))
  }

  const handleLayoutChange = (currentLayout: Layout[]) => {
    // While resizing, onResizeStop owns the layout (linked give & take). Ignore
    // RGL's trailing raw onLayoutChange so it can't overwrite that result.
    if (maximizedWidget) return
    if (ignoreLayoutPersistRef.current) return
    if (resizeStartRef.current || dragActiveRef.current) return
    const repaired = repairIdleLayouts({ lg: currentLayout })
    setLayouts(persistLayouts(repaired))
  }

  // Snapshot of the breakpoint layout captured when a resize begins. Adjacency is
  // computed against these ORIGINAL positions so neighbors give/take predictably
  // throughout the whole gesture (not against mid-resize, shifting positions).
  const resizeStartRef = useRef<Layout[] | null>(null)
  const resizeGestureRef = useRef(0)
  const dragActiveRef = useRef(false)

  // Compute a "give & take" layout: as the active widget's edge moves, the
  // adjacent widget(s) sharing that edge shrink/grow by the same amount so the
  // shared boundary stays flush and nothing overlaps. Clamps to each neighbor's
  // min size (and caps the active widget so it can't crush a neighbor past min).
  const linkedLayout = (newItem: Layout): Layout[] | null => {
    const start = resizeStartRef.current
    if (!start) return null
    const startSelf = start.find((l) => l.i === newItem.i)
    if (!startSelf) return null

    const next = start.map((l) => ({ ...l }))

    const getVerticalBoundaryGroups = (boundary: number) => {
      const leftCandidates = start.filter((it) => it.x + it.w === boundary)
      const rightCandidates = start.filter((it) => it.x === boundary)
      const leftIds = new Set<string>()
      const rightIds = new Set<string>()
      let minY = startSelf.y
      let maxY = startSelf.y + startSelf.h
      let changed = true

      while (changed) {
        changed = false
        for (const it of [...leftCandidates, ...rightCandidates]) {
          if (!intervalOverlaps(it.y, it.y + it.h, minY, maxY)) continue
          const ids = it.x + it.w === boundary ? leftIds : rightIds
          if (ids.has(it.i)) continue
          ids.add(it.i)
          minY = Math.min(minY, it.y)
          maxY = Math.max(maxY, it.y + it.h)
          changed = true
        }
      }

      return {
        leftGroup: leftCandidates.filter((it) => leftIds.has(it.i)),
        rightGroup: rightCandidates.filter((it) => rightIds.has(it.i)),
      }
    }

    const getHorizontalBoundaryGroups = (boundary: number) => {
      const topCandidates = start.filter((it) => it.y + it.h === boundary)
      const bottomCandidates = start.filter((it) => it.y === boundary)
      const topIds = new Set<string>()
      const bottomIds = new Set<string>()
      let minX = startSelf.x
      let maxX = startSelf.x + startSelf.w
      let changed = true

      while (changed) {
        changed = false
        for (const it of [...topCandidates, ...bottomCandidates]) {
          if (!intervalOverlaps(it.x, it.x + it.w, minX, maxX)) continue
          const ids = it.y + it.h === boundary ? topIds : bottomIds
          if (ids.has(it.i)) continue
          ids.add(it.i)
          minX = Math.min(minX, it.x)
          maxX = Math.max(maxX, it.x + it.w)
          changed = true
        }
      }

      return {
        topGroup: topCandidates.filter((it) => topIds.has(it.i)),
        bottomGroup: bottomCandidates.filter((it) => bottomIds.has(it.i)),
      }
    }

    const moveVerticalBoundary = (boundary: number, rawDelta: number) => {
      if (rawDelta === 0) return
      const { leftGroup, rightGroup } = getVerticalBoundaryGroups(boundary)
      if (leftGroup.length === 0 && rightGroup.length === 0) return

      let delta = rawDelta
      for (const it of leftGroup) delta = Math.max(delta, (it.minW ?? 1) - it.w)
      for (const it of rightGroup) delta = Math.min(delta, it.w - (it.minW ?? 1))

      const nextBoundary = boundary + delta
      for (const startItem of leftGroup) {
        const item = next.find((candidate) => candidate.i === startItem.i)
        if (item) item.w = nextBoundary - startItem.x
      }
      for (const startItem of rightGroup) {
        const item = next.find((candidate) => candidate.i === startItem.i)
        if (!item) continue
        const right = startItem.x + startItem.w
        item.x = nextBoundary
        item.w = right - nextBoundary
      }
    }

    const moveHorizontalBoundary = (boundary: number, rawDelta: number) => {
      if (rawDelta === 0) return
      const { topGroup, bottomGroup } = getHorizontalBoundaryGroups(boundary)
      if (topGroup.length === 0 && bottomGroup.length === 0) return

      let delta = rawDelta
      for (const it of topGroup) delta = Math.max(delta, (it.minH ?? 1) - it.h)
      for (const it of bottomGroup) delta = Math.min(delta, it.h - (it.minH ?? 1))

      const nextBoundary = boundary + delta
      for (const startItem of topGroup) {
        const item = next.find((candidate) => candidate.i === startItem.i)
        if (item) item.h = nextBoundary - startItem.y
      }
      for (const startItem of bottomGroup) {
        const item = next.find((candidate) => candidate.i === startItem.i)
        if (!item) continue
        const bottom = startItem.y + startItem.h
        item.y = nextBoundary
        item.h = bottom - nextBoundary
      }
    }

    const leftDelta = newItem.x - startSelf.x
    const rightDelta = newItem.x + newItem.w - (startSelf.x + startSelf.w)
    const topDelta = newItem.y - startSelf.y
    const bottomDelta = newItem.y + newItem.h - (startSelf.y + startSelf.h)

    if (leftDelta !== 0) moveVerticalBoundary(startSelf.x, leftDelta)
    if (rightDelta !== 0) moveVerticalBoundary(startSelf.x + startSelf.w, rightDelta)
    if (topDelta !== 0) moveHorizontalBoundary(startSelf.y, topDelta)
    if (bottomDelta !== 0) moveHorizontalBoundary(startSelf.y + startSelf.h, bottomDelta)

    return next

    /*
    if (false && dw !== 0) {
      if (newItem.x === oldItem.x) {
        // Right edge moved → adjust the right neighbor(s).
        for (const nb of next) {
          if (nb.i === self.i) continue
          const s = startOf(nb.i)
          if (s.x !== startSelf!.x + startSelf!.w || !sV(s)) continue
          const minW = nb.minW ?? 1
          const newX = self.x + self.w
          const newW = s.x + s.w - newX
          if (newW < minW) {
            self.w = s.x + s.w - minW - self.x
            nb.x = self.x + self.w
            nb.w = minW
          } else {
            nb.x = newX
            nb.w = newW
          }
        }
      } else {
        // Left edge moved → adjust the left neighbor(s).
        for (const nb of next) {
          if (nb.i === self.i) continue
          const s = startOf(nb.i)
          if (s.x + s.w !== startSelf!.x || !sV(s)) continue
          const minW = nb.minW ?? 1
          const newW = self.x - s.x
          if (newW < minW) {
            nb.w = minW
            self.x = s.x + minW
            self.w = startSelf!.x + startSelf!.w - self.x
          } else {
            nb.w = newW
          }
        }
      }
    }

    // Vertical give/take (pure height change on a stacked neighbor).
    if (dh !== 0 && newItem.x === oldItem.x) {
      if (newItem.y === oldItem.y) {
        // Bottom edge moved → adjust the neighbor(s) below.
        for (const nb of next) {
          if (nb.i === self.i) continue
          const s = startOf(nb.i)
          if (s.y !== startSelf.y + startSelf.h || !sH(s)) continue
          const minH = nb.minH ?? 1
          const newY = self.y + self.h
          const newH = s.y + s.h - newY
          if (newH < minH) {
            self.h = s.y + s.h - minH - self.y
            nb.y = self.y + self.h
            nb.h = minH
          } else {
            nb.y = newY
            nb.h = newH
          }
        }
      } else {
        // Top edge moved → adjust the neighbor(s) above.
        for (const nb of next) {
          if (nb.i === self.i) continue
          const s = startOf(nb.i)
          if (s.y + s.h !== startSelf.y || !sH(s)) continue
          const minH = nb.minH ?? 1
          const newH = self.y - s.y
          if (newH < minH) {
            nb.h = minH
            self.y = s.y + minH
            self.h = startSelf.y + startSelf.h - self.y
          } else {
            nb.h = newH
          }
        }
      }
    }

    const syncHorizontalBoundary = (boundary: number, rawDelta: number) => {
      if (rawDelta === 0) return
      const topGroup = start.filter((it) => it.y + it.h === boundary)
      const bottomGroup = start.filter((it) => it.y === boundary)
      if (topGroup.length === 0 && bottomGroup.length === 0) return

      let delta = rawDelta
      for (const it of topGroup) delta = Math.max(delta, (it.minH ?? 1) - it.h)
      for (const it of bottomGroup) delta = Math.min(delta, it.h - (it.minH ?? 1))

      const nextBoundary = boundary + delta
      for (const startItem of topGroup) {
        const item = next.find((candidate) => candidate.i === startItem.i)
        if (item) item.h = nextBoundary - startItem.y
      }
      for (const startItem of bottomGroup) {
        const item = next.find((candidate) => candidate.i === startItem.i)
        if (!item) continue
        const bottom = startItem.y + startItem.h
        item.y = nextBoundary
        item.h = bottom - nextBoundary
      }
    }

    const leftDelta = newItem.x - startSelf.x
    const rightDelta = newItem.x + newItem.w - (startSelf.x + startSelf.w)
    const topDelta = newItem.y - startSelf.y
    const bottomDelta = newItem.y + newItem.h - (startSelf.y + startSelf.h)

    if (leftDelta !== 0) syncVerticalBoundary(startSelf.x, leftDelta)
    if (rightDelta !== 0) syncVerticalBoundary(startSelf.x + startSelf.w, rightDelta)
    if (topDelta !== 0) syncHorizontalBoundary(startSelf.y, topDelta)
    if (bottomDelta !== 0) syncHorizontalBoundary(startSelf.y + startSelf.h, bottomDelta)

    return next
    */
  }

  const handleResizeStart = (layout: Layout[]) => {
    if (maximizedWidget) return
    resizeGestureRef.current += 1
    setIsResizing(true)
    resizeStartRef.current = layout.map((l) => ({ ...l }))
  }

  const handleResize = (_layout: Layout[], _oldItem: Layout, newItem: Layout) => {
    if (maximizedWidget) return
    const linked = linkedLayout(newItem)
    if (!linked) return

    // Resize every widget that shares the moving boundary. For example, when a
    // tall right-hand widget is widened from its left edge, all vertically
    // stacked widgets on its left give up the same number of columns together.
    setLayouts((prev) => ({ ...prev, lg: linked }))
  }

  const handleResizeStop = (layout: Layout[], _oldItem: Layout, newItem: Layout) => {
    if (maximizedWidget) return
    // RGL's callback layout only contains its own resize result. Recompute from
    // the gesture snapshot so the linked neighbours are also retained after the
    // pointer is released, then persist that exact shared-boundary layout.
    const next = linkedLayout(newItem) ?? preserveFreeLayout(layout, GRID_COLS)
    setLayouts((prev) => persistLayouts({ ...prev, lg: next }))
    // RGL can emit a raw onLayoutChange after React has committed this linked
    // layout. A zero-delay timer is too early: that late event then treats the
    // collision-resolved raw layout as authoritative and rearranges widgets.
    // Keep the gesture guard through two paint frames so only the linked result
    // survives. The gesture id prevents an older cleanup from ending a newly
    // started resize.
    const gesture = resizeGestureRef.current
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (resizeGestureRef.current !== gesture) return
        resizeStartRef.current = null
        setIsResizing(false)
      })
    })
  }

  const handleDragStart = () => {
    if (maximizedWidget) return
    dragActiveRef.current = true
  }

  const handleDrag = (
    _layout: Layout[],
    _oldItem: Layout,
    newItem: Layout,
    _placeholder: Layout,
    e: MouseEvent,
  ) => {
    if (maximizedWidget) return
    const rect = gridViewportRef.current?.getBoundingClientRect()
    if (!rect) return
    setActiveSnapPreset(getSnapPreset(rect, newItem, e.clientX, e.clientY, adaptiveRowHeight))
  }

  // After a move, keep the user's chosen position. Collisions are resolved
  // minimally, but empty space is preserved so widgets can live left, right, or
  // lower on the dashboard.
  const handleDragStop = (
    layout: Layout[],
    _oldItem: Layout,
    newItem: Layout,
    _placeholder: Layout,
    e: MouseEvent,
  ) => {
    if (maximizedWidget) return
    const rect = gridViewportRef.current?.getBoundingClientRect()
    const preset =
      activeSnapPreset ??
      (rect ? getSnapPreset(rect, newItem, e.clientX, e.clientY, adaptiveRowHeight) : null)
    const packed = preset ? applySnapPreset(layout, newItem.i, preset) : preserveFreeLayout(layout, GRID_COLS)
    setLayouts((prev) => persistLayouts({ ...prev, lg: packed }))
    setActiveSnapPreset(null)
    setTimeout(() => {
      dragActiveRef.current = false
    }, 0)
  }

  const resetLayout = () => {
    setLayouts(defaultLayouts)
    persistActive(isAdmin ? DEFAULT_ACTIVE : [])
    removeUserScopedItem(LAYOUTS_KEY)
    removePortalScopedItem(LAYOUTS_KEY)
  }

  const renderedLayouts = useMemo(() => {
    if (isResizing || dragActiveRef.current) return layouts
    return repairIdleLayouts(layouts)
  }, [isResizing, layouts])
  const adaptiveRowHeight = useMemo(() => {
    const rows = Math.max(1, ...(renderedLayouts.lg ?? []).map((item) => item.y + item.h))
    if (gridHeight <= 0) return GRID_ROW_HEIGHT
    const fitHeight = Math.floor((gridHeight - 4) / rows)
    return Math.max(72, Math.min(GRID_ROW_HEIGHT, fitHeight))
  }, [gridHeight, renderedLayouts])

  // The WidgetFrame + plugin body for an app, reused both inside the grid and in
  // the maximized overlay. No outer keyed wrapper here.
  const renderWidgetInner = (id: string, options?: { overlay?: boolean }): ReactNode => {
    const plugin = APP_MAP[id]
    if (!plugin) return null
    const maximized = maximizedWidget === id
    const ctx: AppContext = {
      isAdmin,
      maximized,
      toggleMaximize: () => toggleWidgetMaximized(id),
      remove: () => removeWidget(id),
    }
    const { Body, HeaderExtra, Provider } = plugin
    const showBody = !maximized || Boolean(options?.overlay)

    const content = (
      <WidgetFrame
        icon={plugin.icon}
        title={plugin.name}
        onClose={() => removeWidget(id)}
        bodyClassName={plugin.bodyClassName}
        maximized={maximized}
        onToggleMaximize={ctx.toggleMaximize}
        extra={HeaderExtra ? <HeaderExtra {...ctx} /> : undefined}
      >
        {showBody ? <Body {...ctx} /> : null}
      </WidgetFrame>
    )

    return Provider ? <Provider ctx={ctx}>{content}</Provider> : content
  }

  const renderWidget = (id: string): ReactNode => {
    if (!APP_MAP[id]) return null
    return (
      <div key={id} className="h-full">
        {renderWidgetInner(id)}
      </div>
    )
  }

  if (!isAdmin && !catalogLoading && installedIds.length === 0) {
    return <Navigate to="/marketplace" replace />
  }

  if (isMobile) {
    return (
      <main className="min-h-full bg-background px-3 py-3">
        <section className="mb-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-h2 text-h2 text-on-surface">안녕하세요, {greetName}님</h1>
              <p className="mt-1 text-caption text-on-surface-variant">
                {publicTitle ? `${publicTitle} · ` : ''}
                {new Date().toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </p>
            </div>
            <Link
              to="/installed-apps"
              className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary"
              aria-label="앱 관리"
            >
              <Icon name="apps" className="text-[20px]" />
            </Link>
          </div>
        </section>

        {activeWidgets.length === 0 ? (
          <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container px-4 py-10 text-center">
            <Icon name="widgets" className="mb-2 text-[34px] text-on-surface-variant" />
            <p className="mb-3 text-body-sm text-on-surface-variant">
              {isAdmin
                ? '대시보드에 표시할 앱이 없습니다. 앱 등록에서 테스트하거나 마켓에서 선택하세요.'
                : '아직 선택한 앱이 없습니다. 마켓플레이스에서 사용할 앱을 고르세요.'}
            </p>
            <Link
              to={isAdmin ? '/app-registry' : '/marketplace'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-h3 text-h3 text-white hover:opacity-90"
            >
              {isAdmin ? '앱 등록으로 이동' : '마켓플레이스로 이동'}
            </Link>
          </section>
        ) : (
          <div className="space-y-3">
            {activeWidgets.filter((id) => APP_MAP[id]).map((id) => {
              const plugin = APP_MAP[id]
              const ctx: AppContext = {
                isAdmin,
                maximized: true,
                toggleMaximize: () => undefined,
                remove: () => persistActive(activeWidgets.filter((activeId) => activeId !== id)),
              }
              const { Body, HeaderExtra, Provider } = plugin
              const body = (
                <section className="min-h-[320px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-sm">
                  <header className="flex h-11 items-center justify-between gap-2 border-b border-outline-variant px-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon name={plugin.icon} className="shrink-0 text-[19px] text-primary" />
                      <h2 className="truncate font-h3 text-h3 text-on-surface">{plugin.name}</h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {HeaderExtra ? <HeaderExtra {...ctx} /> : null}
                      <button
                        type="button"
                        onClick={ctx.remove}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
                        aria-label="홈에서 제거"
                      >
                        <Icon name="close" className="text-[17px]" />
                      </button>
                    </div>
                  </header>
                  <div className={`h-[420px] overflow-auto p-3 ${plugin.bodyClassName ?? ''}`}>
                    <Body {...ctx} />
                  </div>
                </section>
              )

              return <div key={id}>{Provider ? <Provider ctx={ctx}>{body}</Provider> : body}</div>
            })}
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="h-[calc(100vh-60px)] overflow-hidden bg-background">
      <div className="h-full w-full pr-4 pl-2 flex flex-col">
        <section className="shrink-0 h-10 flex items-center justify-between gap-3">
          <div className="min-w-0 flex flex-1 items-center justify-between gap-3 overflow-hidden">
            <div className="dashboard-compact-info min-w-0 flex items-center gap-2 overflow-hidden">
              <h1 className="font-display text-display text-on-surface mb-0.5">안녕하세요, {greetName}님</h1>
              <p className="text-on-surface-variant font-body-sm">
                {publicTitle && <span className="mr-1 font-medium text-primary">{publicTitle}</span>}
                오늘은{' '}
                {new Date().toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
                입니다.
                {isAdmin && session?.organization && (
                  <>
                    {' '}
                    <span className="text-primary font-medium">[{session.organization}]</span> 관리자 콘솔입니다.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/installed-apps"
                className="px-2.5 py-1.5 bg-primary text-on-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                title="설치된 앱 관리"
              >
                <Icon name="apps" className="text-[18px]" />
                <span className="text-caption font-medium">설치된 앱</span>
              </Link>
              <button
                onClick={resetLayout}
                className="px-2.5 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-lg border border-outline-variant transition-colors flex items-center gap-1.5"
                title="레이아웃 초기화"
              >
                <Icon name="refresh" className="text-on-surface-variant text-[18px]" />
                <span className="text-caption text-on-surface-variant">레이아웃 초기화</span>
              </button>
              <div className="flex items-center gap-1.5 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant shadow-sm">
                <Icon name="cloud_done" className="text-success text-[18px]" />
                <span className="font-label text-label text-on-surface-variant">시스템 상태: 정상</span>
              </div>
            </div>
          </div>
        </section>

        <div ref={gridViewportRef} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {activeSnapPreset && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-0 z-30 h-full border-l border-dashed border-primary/50" />
            <div className="pointer-events-none absolute left-0 top-1/3 z-30 w-full border-t border-dashed border-primary/50" />
            <div className="pointer-events-none absolute left-0 top-2/3 z-30 w-full border-t border-dashed border-primary/50" />
            <div
              className="pointer-events-none absolute z-30 rounded-xl border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.03)]"
              style={{
                left: `${(activeSnapPreset.x / GRID_COLS) * 100}%`,
                top: activeSnapPreset.y * adaptiveRowHeight,
                width: `${(activeSnapPreset.w / GRID_COLS) * 100}%`,
                height: activeSnapPreset.h * adaptiveRowHeight,
              }}
            >
              <div className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-caption font-semibold text-on-primary shadow-sm">
                {activeSnapPreset.label}
              </div>
            </div>
          </>
        )}
        {activeWidgets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container p-12 text-center">
            <Icon name="widgets" className="text-[40px] text-on-surface-variant mb-3" />
            <p className="mb-4 text-body text-on-surface-variant">
              {isAdmin
                ? '대시보드에 표시할 앱이 없습니다. 앱을 테스트·등록한 뒤 사용자가 선택할 수 있습니다.'
                : '아직 선택한 앱이 없습니다. 마켓플레이스에서 사용할 앱을 고르세요.'}
            </p>
            <Link
              to={isAdmin ? '/app-registry' : '/marketplace'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-h3 text-h3 text-white hover:opacity-90"
            >
              {isAdmin ? '앱 등록으로 이동' : '마켓플레이스로 이동'}
            </Link>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={renderedLayouts.lg ?? []}
            cols={GRID_COLS}
            width={gridWidth}
            rowHeight={adaptiveRowHeight}
            onLayoutChange={handleLayoutChange}
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeStop={handleResizeStop}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragStop={handleDragStop}
            draggableHandle=".drag-handle"
            draggableCancel=".no-drag, button, a, input, select, textarea"
            isDraggable={true}
            isResizable={true}
            resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
            margin={[0, 0]}
            containerPadding={[0, 0]}
            compactType={null}
            allowOverlap={isResizing}
            preventCollision={isResizing}
            useCSSTransforms={false}
          >
            {activeWidgets.map((id) => renderWidget(id))}
          </GridLayout>
        )}
        </div>
      </div>

      {/* Maximized widget overlay (double-click a widget header to toggle) */}
      {maximizedWidget && APP_MAP[maximizedWidget] && (
        <div className="fixed left-[160px] top-topbar-height right-0 bottom-0 z-40 p-4 bg-background/80 backdrop-blur-sm">
          <div className="h-full">{renderWidgetInner(maximizedWidget, { overlay: true })}</div>
        </div>
      )}
    </main>
  )
}

// Made with Bob
