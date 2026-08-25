import { useEffect, useMemo, useState } from 'react'
import { taskService, subscribeTasks } from '../lib/taskService'
import type { Task } from '../types/task'
import { TASK_PRIORITY_META } from '../types/task'
import { Icon } from './Icon'
import TaskDialog from './TaskDialog'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function dueLabel(date: string | null): { text: string; tone: 'overdue' | 'today' | 'normal' } | null {
  if (!date) return null
  const today = todayStr()
  if (date < today) return { text: formatShort(date), tone: 'overdue' }
  if (date === today) return { text: '오늘', tone: 'today' }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date === tomorrow.toISOString().split('T')[0]) return { text: '내일', tone: 'normal' }
  return { text: formatShort(date), tone: 'normal' }
}

function formatShort(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function TasksWidget() {
  const [tasks, setTasks] = useState<Task[]>(() => taskService.getTasks())
  const [quickTitle, setQuickTitle] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  useEffect(() => subscribeTasks(() => setTasks(taskService.getTasks())), [])

  const remaining = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks])

  const quickAdd = () => {
    const title = quickTitle.trim()
    if (!title) return
    taskService.createTask({ title })
    setQuickTitle('')
  }

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    setDialogOpen(true)
  }

  return (
    <div className="no-drag h-full flex flex-col">
      {/* Quick add */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') quickAdd()
          }}
          placeholder="할 일 추가..."
          className="flex-1 min-w-0 px-3 py-2 bg-surface-container-high border border-outline rounded-lg text-body text-on-surface focus:outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={openNew}
          title="상세 추가 (마감일·우선순위)"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
        >
          <Icon name="add" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-auto space-y-1.5">
        {tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-on-surface-variant py-6">
            <Icon name="task_alt" className="text-[32px] mb-2 opacity-60" />
            <p className="text-body-sm">등록된 할 일이 없습니다.</p>
            <p className="text-caption">위 입력창에 입력하거나 + 버튼으로 추가하세요.</p>
          </div>
        ) : (
          tasks.map((task) => {
            const meta = TASK_PRIORITY_META[task.priority]
            const due = dueLabel(task.dueDate)
            return (
              <div
                key={task.id}
                className="group flex items-center gap-2.5 p-2 rounded-lg border border-outline-variant hover:border-primary hover:bg-surface-container-high transition-colors"
              >
                <button
                  type="button"
                  onClick={() => taskService.toggleTask(task.id)}
                  aria-label={task.completed ? '완료 취소' : '완료'}
                  className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    task.completed ? 'bg-primary border-primary' : 'border-outline hover:bg-primary/10'
                  }`}
                >
                  {task.completed && <Icon name="check" className="text-[14px] text-on-primary" />}
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(task)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p
                    className={`text-body truncate ${
                      task.completed ? 'line-through text-on-surface-variant' : 'text-on-surface font-medium'
                    }`}
                  >
                    {task.title}
                  </p>
                  {due && (
                    <span
                      className={`text-caption ${
                        due.tone === 'overdue'
                          ? 'text-error'
                          : due.tone === 'today'
                            ? 'text-primary font-medium'
                            : 'text-on-surface-variant'
                      }`}
                    >
                      <Icon name="event" className="text-[12px] align-middle mr-0.5" />
                      {due.text}
                    </span>
                  )}
                </button>

                <span
                  className="shrink-0 w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  title={`우선순위: ${meta.label}`}
                />

                <button
                  type="button"
                  onClick={() => taskService.deleteTask(task.id)}
                  aria-label="삭제"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error transition-all"
                >
                  <Icon name="delete" className="text-[16px]" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {tasks.length > 0 && (
        <div className="shrink-0 pt-2 mt-1 border-t border-outline-variant text-caption text-on-surface-variant">
          남은 할 일 {remaining}개 / 전체 {tasks.length}개
        </div>
      )}

      <TaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} task={editing} />
    </div>
  )
}
