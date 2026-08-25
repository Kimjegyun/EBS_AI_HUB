import { Icon } from '../components/Icon'
import type { AppPlugin } from './types'

const ACTIONS = [
  { icon: 'add_box', label: 'New Plugin', color: 'text-primary' },
  { icon: 'analytics', label: 'Export Data', color: 'text-secondary' },
  { icon: 'history', label: 'Activity Log', color: 'text-warning' },
  { icon: 'hub', label: 'API Keys', color: 'text-danger' },
]

function QuickActionsBody() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          className="no-drag flex flex-col items-center justify-center p-4 rounded-lg bg-surface-container-low border border-outline-variant hover:border-primary hover:bg-surface-container transition-all group"
        >
          <Icon name={a.icon} className={`mb-2 group-hover:scale-110 transition-transform ${a.color}`} />
          <span className="font-label text-label text-on-surface">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

export const quickActionsApp: AppPlugin = {
  id: 'quick-actions',
  name: '빠른 작업',
  icon: 'bolt',
  description: '자주 사용하는 기능에 빠르게 접근할 수 있는 바로가기 패널입니다.',
  category: '생산성',
  version: '1.0.0',
  defaultSize: { w: 12, h: 2, minW: 4, minH: 2 },
  defaultActive: true,
  Body: QuickActionsBody,
}
