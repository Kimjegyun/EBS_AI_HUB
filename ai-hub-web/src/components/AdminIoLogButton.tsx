import { useAuth } from '../auth/AuthContext'
import { Icon } from './Icon'
import { openIoLogWindow } from '../lib/ioLogWindow'

type Props = {
  compact?: boolean
}

export default function AdminIoLogButton({ compact = false }: Props) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return null

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => openIoLogWindow()}
        className="h-9 w-9 inline-flex items-center justify-center rounded-full text-primary hover:bg-primary/10"
        aria-label="명령 로그 창 열기"
        title="명령 로그 창"
      >
        <Icon name="terminal" className="text-[20px]" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openIoLogWindow()}
      className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 font-label text-label text-primary hover:bg-primary/10 transition-colors"
      aria-label="명령 로그 창 열기"
      title="명령 로그 창"
    >
      <Icon name="terminal" className="text-[18px]" />
      <span className="hidden md:inline">로그 탭</span>
    </button>
  )
}
