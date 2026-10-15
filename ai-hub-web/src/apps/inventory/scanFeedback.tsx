import { Icon } from '../../components/Icon'

/** Outcome of the last scan, shown right under the camera view. */
export interface ScanFeedback {
  kind: 'success' | 'otherDept' | 'failure' | 'duplicate'
  detail?: string
  /** Changes on every scan so a repeated outcome is announced again. */
  key: number
}

const LOOK: Record<ScanFeedback['kind'], { title: string; icon: string; className: string }> = {
  success: { title: '인식완료', icon: 'check_circle', className: 'border-success/40 bg-success/15 text-success' },
  otherDept: { title: '타부서자산', icon: 'warning', className: 'border-warning/50 bg-warning/15 text-warning' },
  failure: { title: '인식실패', icon: 'error', className: 'border-error/40 bg-error/10 text-error' },
  duplicate: { title: '이미 조사됨', icon: 'info', className: 'border-outline-variant bg-surface-container-high text-on-surface' },
}

export function ScanFeedbackBanner({ feedback }: { feedback: ScanFeedback }) {
  const look = LOOK[feedback.kind]
  return (
    <div key={feedback.key} role="alert" className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2.5 ${look.className}`}>
      <Icon name={look.icon} className="mt-0.5 shrink-0 text-[22px]" />
      <div className="min-w-0">
        <p className="text-body font-bold">{look.title}</p>
        {feedback.detail && <p className="text-caption text-on-surface break-words">{feedback.detail}</p>}
      </div>
    </div>
  )
}
