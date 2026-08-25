// App plugin contract for EBS AI 허브.
//
// Every dashboard "app" is a self-contained plugin module that declares its own
// metadata AND its rendering. The shell (DashboardPage) and the management UIs
// (마켓플레이스 / 설치된 앱) all derive purely from the registry, so adding a new
// app means: create one module file and register it in `apps/registry.ts` — no
// edits to the dashboard, marketplace, or installed-apps pages required.

import type { ComponentType, ReactNode } from 'react'

export type AppCategory = '코어' | '생산성' | '운영' | 'AI'

export interface AppSize {
  w: number
  h: number
  minW: number
  minH: number
}

/**
 * Runtime services the shell provides to every app instance. Apps receive this
 * as their props, so a plugin never needs to reach back into the dashboard.
 */
export interface AppContext {
  /** Current user is an administrator. */
  isAdmin: boolean
  /** This app is currently maximized to fill the workspace. */
  maximized: boolean
  /** Toggle maximize / restore for this app. */
  toggleMaximize: () => void
  /** Remove (deactivate) this app from the dashboard. */
  remove: () => void
}

export interface AppPlugin {
  /** Stable unique id (also used as the localStorage / layout key). */
  id: string
  name: string
  /** Material Symbols icon name. */
  icon: string
  description: string
  category: AppCategory
  version?: string
  author?: string
  /** Default grid size when first added to the dashboard. */
  defaultSize: AppSize
  /** Core apps are always installed and cannot be uninstalled. */
  core?: boolean
  /** Activated (shown on the dashboard) on a fresh account. */
  defaultActive?: boolean
  /** Installed on a fresh account. Defaults to true when omitted. */
  defaultInstalled?: boolean
  /** Extra classes for the widget body wrapper (e.g. '!p-0' for edge-to-edge). */
  bodyClassName?: string

  /** The widget body. Receives the shell-provided context as props. */
  Body: ComponentType<AppContext>
  /** Optional header controls rendered on the right of the widget title bar. */
  HeaderExtra?: ComponentType<AppContext>
  /**
   * Optional wrapper around the whole widget frame. Use when header controls and
   * the body need to share internal state (e.g. the calendar's dialogs). Both
   * `HeaderExtra` and `Body` render inside this provider's subtree.
   */
  Provider?: ComponentType<{ ctx: AppContext; children: ReactNode }>
}
