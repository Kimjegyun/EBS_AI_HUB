import { useEffect, useState } from 'react'
import { eventService } from '../lib/eventService'
import type { PersonalEvent } from '../types/event'
import { Icon } from './Icon'

type Props = {
  open: boolean
  date?: string
  refreshKey: number
  onClose: () => void
  onAdd: (date: string) => void
  onEdit: (event: PersonalEvent) => void
  onEventChange: () => void
}

export default function DayEventTableDialog({ open, date, refreshKey, onClose, onAdd, onEdit, onEventChange }: Props) {
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !date) return
    let active = true
    setLoading(true)
    setError('')
    void eventService.getPersonalEventsByDateRange(date, date)
      .then((rows) => { if (active) setEvents(rows) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '일정을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, date, refreshKey])

  if (!open || !date) return null

  const remove = async (event: PersonalEvent) => {
    if (!confirm(`'${event.event_name}' 일정을 삭제하시겠습니까?`)) return
    setLoading(true); setError('')
    try {
      await eventService.deletePersonalEvent(event.id)
      setEvents((current) => current.filter((item) => item.id !== event.id))
      onEventChange()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '일정 삭제에 실패했습니다.')
    } finally { setLoading(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl bg-surface-container shadow-xl">
      <div className="flex items-center justify-between border-b border-outline-variant p-5">
        <div><h2 className="font-h2 text-h2 text-on-surface">일정 관리</h2><p className="mt-1 text-body-sm text-on-surface-variant">{date} 등록 일정</p></div>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-surface-container-high" aria-label="닫기"><Icon name="close" /></button>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between"><p className="text-body-sm text-on-surface-variant">등록된 일정 {events.length}건</p><button type="button" onClick={() => onAdd(date)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 font-medium text-on-primary"><Icon name="add" />신규 일정 등록</button></div>
        {error && <p className="mb-3 rounded-lg bg-error-container p-3 text-error">{error}</p>}
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="w-full min-w-[720px] border-collapse text-left text-body-sm">
            <thead className="bg-surface-container-high text-on-surface-variant"><tr><th className="px-3 py-2">시간</th><th className="px-3 py-2">일정 제목</th><th className="px-3 py-2">장소</th><th className="px-3 py-2">설명</th><th className="w-44 min-w-44 px-3 py-2 text-center">관리</th></tr></thead>
            <tbody>{loading && events.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-on-surface-variant">일정을 불러오는 중...</td></tr> : events.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-on-surface-variant">등록된 일정이 없습니다. 신규 일정을 등록해 주세요.</td></tr> : events.map((event) => <tr key={event.id} className="border-t border-outline-variant bg-white"><td className="whitespace-nowrap px-3 py-3">{event.is_all_day ? '종일' : event.event_time || '-'}</td><td className="px-3 py-3 font-medium text-on-surface">{event.event_name}</td><td className="px-3 py-3 text-on-surface-variant">{event.location || '-'}</td><td className="max-w-xs truncate px-3 py-3 text-on-surface-variant" title={event.description}>{event.description || '-'}</td><td className="w-44 min-w-44 px-3 py-3"><div className="flex flex-nowrap items-center justify-center gap-2"><button type="button" onClick={() => onEdit(event)} className="inline-flex min-w-[64px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-outline-variant px-3 py-1.5 text-primary"><Icon name="edit" className="text-[15px]" />수정</button><button type="button" disabled={loading} onClick={() => void remove(event)} className="inline-flex min-w-[64px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-error/30 px-3 py-1.5 text-error"><Icon name="delete" className="text-[15px]" />삭제</button></div></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
}
