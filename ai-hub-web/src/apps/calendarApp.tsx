import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import EnhancedCalendar from '../components/EnhancedCalendar'
import PersonalEventDialog from '../components/PersonalEventDialog'
import HolidayManagementDialog from '../components/HolidayManagementDialog'
import { Icon } from '../components/Icon'
import type { AppContext, AppPlugin } from './types'
import type { CalendarEvent, PersonalEvent } from '../types/event'

// Internal API shared between the calendar's header controls and its body so the
// whole app stays self-contained (it owns its own dialogs and refresh logic).
interface CalendarApi {
  refreshKey: number
  openAddEvent: (date?: string) => void
  openHolidayDialog: () => void
  onEventClick: (event: CalendarEvent) => void
}

const CalendarCtx = createContext<CalendarApi | null>(null)
const useCalendarApi = () => {
  const api = useContext(CalendarCtx)
  if (!api) throw new Error('Calendar components must render inside CalendarProvider')
  return api
}

function CalendarProvider({ ctx, children }: { ctx: AppContext; children: ReactNode }) {
  const [showHoliday, setShowHoliday] = useState(false)
  const [showEvent, setShowEvent] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<PersonalEvent | undefined>()
  const [selectedDate, setSelectedDate] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const api = useMemo<CalendarApi>(
    () => ({
      refreshKey,
      openAddEvent: (date) => {
        setSelectedEvent(undefined)
        setSelectedDate(date ?? new Date().toISOString().split('T')[0])
        setShowEvent(true)
      },
      openHolidayDialog: () => setShowHoliday(true),
      onEventClick: (event) => {
        if (event.type === 'personal') {
          setSelectedEvent(event as unknown as PersonalEvent)
          setShowEvent(true)
        }
      },
    }),
    [refreshKey],
  )

  return (
    <CalendarCtx.Provider value={api}>
      {children}
      <PersonalEventDialog
        open={showEvent}
        onClose={() => {
          setShowEvent(false)
          setSelectedEvent(undefined)
          setSelectedDate(undefined)
        }}
        onEventChange={() => setRefreshKey((k) => k + 1)}
        event={selectedEvent}
        initialDate={selectedDate}
      />
      {ctx.isAdmin && (
        <HolidayManagementDialog
          open={showHoliday}
          onClose={() => setShowHoliday(false)}
          onHolidayChange={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </CalendarCtx.Provider>
  )
}

function CalendarHeaderExtra(ctx: AppContext) {
  const api = useCalendarApi()
  return (
    <>
      {ctx.isAdmin && (
        <button
          onClick={api.openHolidayDialog}
          className="no-drag p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
          title="회사 휴일 관리"
          aria-label="회사 휴일 관리"
        >
          <Icon name="settings" className="text-on-surface-variant text-[18px]" />
        </button>
      )}
      <button
        onClick={() => api.openAddEvent()}
        className="no-drag p-1.5 rounded-full bg-primary hover:bg-primary/90 transition-colors"
        title="일정 추가"
        aria-label="일정 추가"
      >
        <Icon name="add" className="text-on-primary text-[18px]" />
      </button>
    </>
  )
}

function CalendarBody(_: AppContext) {
  const api = useCalendarApi()
  return (
    <EnhancedCalendar
      key={api.refreshKey}
      bare
      onEventClick={api.onEventClick}
      onAddEvent={api.openAddEvent}
    />
  )
}

export const calendarApp: AppPlugin = {
  id: 'calendar',
  name: '캘린더',
  icon: 'calendar_month',
  description: '회사 휴일·법정공휴일과 개인 일정을 한 달 단위로 확인하는 기본 캘린더 앱입니다.',
  category: '코어',
  version: '1.2.0',
  defaultSize: { w: 6, h: 5, minW: 3, minH: 3 },
  core: true,
  defaultActive: true,
  bodyClassName: '!p-0',
  Provider: CalendarProvider,
  HeaderExtra: CalendarHeaderExtra,
  Body: CalendarBody,
}
