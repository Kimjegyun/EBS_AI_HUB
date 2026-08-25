import { useState, useEffect } from 'react';
import { eventService } from '../lib/eventService';
import { userPreferenceService } from '../lib/userPreferenceService';
import { taskService, subscribeTasks } from '../lib/taskService';
import { getUserScopedItem, setUserScopedItem } from '../lib/userScopedStorage';
import type { CalendarEvent } from '../types/event';
import type { Task } from '../types/task';
import { TASK_PRIORITY_META } from '../types/task';
import { Icon } from './Icon';
import TaskDialog from './TaskDialog';

interface EnhancedCalendarProps {
  year?: number;
  month?: number;
  onDateClick?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onAddEvent?: (date: string) => void;
  /** When true, render without the outer card chrome (border/shadow) so the
   *  calendar can fill a parent WidgetFrame and not clash with resize handles. */
  bare?: boolean;
  /** Double-clicking the month header triggers this (used to maximize the widget). */
  onHeaderDoubleClick?: () => void;
}

const CALENDAR_CACHE_PREFIX = 'enhanced-calendar-events';

function calendarCacheKey(year: number, month: number, showCompanyHolidays: boolean): string {
  return `${CALENDAR_CACHE_PREFIX}:${year}:${month}:${showCompanyHolidays ? 'company' : 'personal'}`;
}

function loadCachedEvents(year: number, month: number, showCompanyHolidays: boolean): CalendarEvent[] {
  try {
    const raw = getUserScopedItem(calendarCacheKey(year, month, showCompanyHolidays));
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
  } catch {
    return [];
  }
}

function saveCachedEvents(
  year: number,
  month: number,
  showCompanyHolidays: boolean,
  events: CalendarEvent[],
): void {
  setUserScopedItem(calendarCacheKey(year, month, showCompanyHolidays), JSON.stringify(events));
}

export default function EnhancedCalendar({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  onDateClick,
  onEventClick,
  onAddEvent,
  bare = false,
  onHeaderDoubleClick,
}: EnhancedCalendarProps) {
  const [currentYear, setCurrentYear] = useState(year);
  const [currentMonth, setCurrentMonth] = useState(month);
  const [showCompanyHolidays, setShowCompanyHolidays] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    loadCachedEvents(year, month, true),
  );
  const [tasks, setTasks] = useState<Task[]>(() => taskService.getTasksByMonth(year, month));
  const [loading, setLoading] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [currentYear, currentMonth, showCompanyHolidays]);

  // Tasks (linked with the 할 일 app) shown as small color markers.
  useEffect(() => {
    setTasks(taskService.getTasksByMonth(currentYear, currentMonth));
    return subscribeTasks(() => {
      setTasks(taskService.getTasksByMonth(currentYear, currentMonth));
    });
  }, [currentYear, currentMonth]);

  const loadPreferences = async () => {
    try {
      const shouldShow = await userPreferenceService.shouldShowCompanyHolidays();
      if (!shouldShow) {
        await userPreferenceService.updatePreferences({ show_company_holidays: true });
      }
      setShowCompanyHolidays(true);
    } catch (err) {
      console.error('Failed to load preferences:', err);
      setShowCompanyHolidays(true);
    }
  };

  const loadEvents = async () => {
    try {
      const cached = loadCachedEvents(currentYear, currentMonth, showCompanyHolidays);
      if (cached.length > 0) {
        setEvents(cached);
      }
      setLoading(cached.length === 0 && events.length === 0);
      const data = await eventService.getCombinedCalendarEvents(
        currentYear,
        currentMonth,
        showCompanyHolidays
      );
      setEvents(data);
      saveCachedEvents(currentYear, currentMonth, showCompanyHolidays, data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  const openTaskDialog = (task: Task) => {
    setSelectedTask(task);
    setTaskDialogOpen(true);
  };

  const handleToggleCompanyHolidays = async () => {
    try {
      const newValue = await userPreferenceService.toggleCompanyHolidays();
      setShowCompanyHolidays(newValue);
    } catch (err) {
      console.error('Failed to toggle company holidays:', err);
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month - 1, 1).getDay();
  };

  const previousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  
  // Only show the current month's days (up to the last day). Leading cells
  // before the 1st and trailing cells after the last day are rendered as blanks
  // so that no previous/next month dates appear and there is no empty extra row.
  const weeksToShow = Math.ceil((firstDay + daysInMonth) / 7);
  const totalCells = weeksToShow * 7;

  // day is null for blank filler cells
  const allDays: Array<{ day: number | null }> = Array.from(
    { length: totalCells },
    (_, index) => {
      const dayNumber = index - firstDay + 1;
      return { day: dayNumber >= 1 && dayNumber <= daysInMonth ? dayNumber : null };
    }
  );

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  if (false && loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-on-surface-variant">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col relative ${bare ? '' : 'bg-surface-container rounded-xl border border-outline-variant shadow-sm'}`}>
      {loading && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-full border border-outline-variant bg-surface-container/90 px-2 py-1 text-caption text-on-surface-variant shadow-sm">
          불러오는 중
        </div>
      )}
      {/* Calendar Header */}
      <div
        className={`shrink-0 flex items-center justify-center gap-1 px-2 py-0.5 select-none ${bare ? '' : 'pr-28'} border-b border-outline-variant`}
        onDoubleClick={onHeaderDoubleClick}
        title={onHeaderDoubleClick ? '더블클릭하여 최대화/복원' : undefined}
      >
        <button
          onClick={previousMonth}
          onDoubleClick={(e) => e.stopPropagation()}
          className="p-0.5 rounded-full hover:bg-surface-container-high transition-colors"
          aria-label="이전 달"
        >
          <Icon name="chevron_left" className="text-on-surface text-[18px]" />
        </button>
        <h3 className="text-body font-semibold text-on-surface whitespace-nowrap">
          {currentYear}년 {currentMonth}월
        </h3>
        <button
          onClick={nextMonth}
          onDoubleClick={(e) => e.stopPropagation()}
          className="p-0.5 rounded-full hover:bg-surface-container-high transition-colors"
          aria-label="다음 달"
        >
          <Icon name="chevron_right" className="text-on-surface text-[18px]" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 min-h-0 px-1.5 py-0.5 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 gap-1 mb-0.5 shrink-0">
          {weekDays.map((day, index) => (
            <div
              key={day}
              className={`text-center text-caption font-semibold py-0.5 ${
                index === 0 ? 'text-error' : index === 6 ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        <div
          className="grid grid-cols-7 gap-1 flex-1 min-h-0"
          style={{ gridTemplateRows: `repeat(${weeksToShow}, minmax(0, 1fr))` }}
        >
          {allDays.map((dayInfo, index) => {
            const dayOfWeek = index % 7;

            // Blank filler cell (before the 1st / after the last day of month)
            if (dayInfo.day === null) {
              return <div key={`blank-${index}`} aria-hidden="true" />;
            }

            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayInfo.day).padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.date === dateStr);
            const today = new Date();
            const isToday = today.getFullYear() === currentYear &&
                           today.getMonth() + 1 === currentMonth &&
                           today.getDate() === dayInfo.day;
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;
            const companyEvents = dayEvents.filter(e => e.type === 'company');
            const personalEvents = dayEvents.filter(e => e.type === 'personal');
            const dayTasks = tasks.filter(t => t.dueDate === dateStr);
            const hasCompanyHoliday = companyEvents.length > 0;
            const hasPersonalEvent = personalEvents.length > 0;
            // 격주 휴무(자동 생성 회사 휴무)는 일반 휴일보다 한 톤 어두운 빨강으로 구분 표시
            const isBiweeklyHoliday = (e: CalendarEvent) => e.id.startsWith('biweekly-');
            const biweeklyPrimary = hasCompanyHoliday && isBiweeklyHoliday(companyEvents[0]);

            return (
              <div
                key={`${currentYear}-${currentMonth}-${dayInfo.day}`}
                onClick={() => {
                  if (onDateClick) {
                    onDateClick(dateStr);
                  }
                }}
                onDoubleClick={() => {
                  if (onAddEvent) {
                    onAddEvent(dateStr);
                  }
                }}
                className={`
                  min-h-0 min-w-0 p-1 border rounded-lg cursor-pointer
                  transition-colors duration-150 relative overflow-hidden
                  ${isToday ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant'}
                  ${hasCompanyHoliday ? 'bg-error/10' : ''}
                  ${hasPersonalEvent && !hasCompanyHoliday ? 'bg-secondary/10' : ''}
                  hover:shadow-md hover:border-primary
                `}
              >
                <div className="h-full flex flex-col">
                  <div
                    className={`
                      text-[11px] leading-tight font-medium text-center mb-0.5
                      ${isToday ? 'text-primary font-bold' : ''}
                      ${hasCompanyHoliday && !biweeklyPrimary ? 'text-error font-bold' : ''}
                      ${hasCompanyHoliday && biweeklyPrimary ? 'font-bold' : ''}
                      ${!hasCompanyHoliday && isSunday ? 'text-error' : ''}
                      ${!hasCompanyHoliday && isSaturday ? 'text-primary' : ''}
                      ${!hasCompanyHoliday && !isSunday && !isSaturday ? 'text-on-surface' : ''}
                    `}
                    style={biweeklyPrimary && !isToday ? { color: '#b91c1c' } : undefined}
                  >
                    {dayInfo.day}
                  </div>

                  {/* Event indicators: holidays show as text, personal events as small color cards */}
                  <div className="flex-1 min-h-0 flex flex-col gap-0.5 overflow-hidden">
                    {/* Company holidays — shown as text */}
                    {companyEvents.slice(0, 1).map((event) => {
                      const biweekly = isBiweeklyHoliday(event);
                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onEventClick) onEventClick(event);
                          }}
                          className={`text-[8px] leading-tight px-1 py-0.5 rounded text-white truncate hover:opacity-80 transition-opacity ${biweekly ? '' : 'bg-error'}`}
                          style={biweekly ? { backgroundColor: '#b91c1c' } : undefined}
                          title={event.name}
                        >
                          {event.name}
                        </div>
                      );
                    })}

                    {/* Personal events — shown as small colored cards */}
                    {personalEvents.length > 0 && (
                      <div className="mt-auto flex flex-col gap-0.5">
                        {personalEvents.slice(0, 3).map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onEventClick) onEventClick(event);
                            }}
                            className="h-1.5 w-full rounded-full bg-secondary hover:opacity-80 transition-opacity"
                            title={event.name}
                            aria-label={`개인 일정: ${event.name}`}
                          />
                        ))}
                        {personalEvents.length > 3 && (
                          <span className="text-[8px] leading-none text-secondary font-medium">
                            +{personalEvents.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tasks (할 일) — small color markers; click to open the linked task */}
                    {dayTasks.length > 0 && (
                      <div className="mt-auto flex items-center flex-wrap gap-0.5 pt-0.5">
                        {dayTasks.slice(0, 4).map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTaskDialog(task);
                            }}
                            className="w-2.5 h-2.5 rounded-full hover:scale-125 transition-transform"
                            style={{
                              backgroundColor: TASK_PRIORITY_META[task.priority].color,
                              opacity: task.completed ? 0.35 : 1,
                            }}
                            title={`할 일: ${task.title}`}
                            aria-label={`할 일: ${task.title}`}
                          />
                        ))}
                        {dayTasks.length > 4 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTaskDialog(dayTasks[4]);
                            }}
                            className="text-[8px] leading-none font-semibold text-on-surface-variant hover:text-primary"
                            title={`할 일 ${dayTasks.length}개`}
                          >
                            +{dayTasks.length - 4}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Add event button */}
                  {onAddEvent && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddEvent(dateStr);
                      }}
                      className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-primary/20 hover:bg-primary/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Icon name="add" className="text-[10px] text-primary" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend & Company Holiday Toggle */}
      <div className="shrink-0 px-2 py-1.5 border-t border-outline-variant space-y-1.5">
        <div className="flex flex-wrap gap-3 text-caption">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-primary rounded bg-primary/5"></div>
            <span className="text-on-surface-variant">오늘</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-error border border-outline-variant rounded"></div>
            <span className="text-error">공휴일·휴일</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border border-outline-variant rounded" style={{ backgroundColor: '#b91c1c' }}></div>
            <span style={{ color: '#b91c1c' }}>격주 휴무</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-secondary/10 border border-outline-variant rounded"></div>
            <span className="text-secondary">개인 일정</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TASK_PRIORITY_META.high.color }}></span>
            <span className="text-on-surface-variant">할 일</span>
          </div>
        </div>
        
        {/* Company Schedule Toggle */}
        <button
          onClick={handleToggleCompanyHolidays}
          className={`
            w-full flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all
            ${showCompanyHolidays
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
            }
            hover:shadow-md
          `}
        >
          <div className="flex items-center gap-2">
            <Icon
              name={showCompanyHolidays ? 'visibility' : 'visibility_off'}
              className="text-[18px]"
            />
            <span className="font-label text-label">회사 휴일 표시</span>
          </div>
          <div className={`
            w-10 h-5 rounded-full transition-colors relative
            ${showCompanyHolidays ? 'bg-primary' : 'bg-outline'}
          `}>
            <div className={`
              absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform
              ${showCompanyHolidays ? 'translate-x-5' : 'translate-x-0'}
            `} />
          </div>
        </button>
      </div>

      <TaskDialog
        open={taskDialogOpen}
        task={selectedTask}
        onClose={() => {
          setTaskDialogOpen(false);
          setSelectedTask(null);
        }}
      />
    </div>
  );
}

// Made with Bob
