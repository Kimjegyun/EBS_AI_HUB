import { useEffect, useState } from 'react'
import { taskService } from '../lib/taskService'
import type { Task, TaskPriority } from '../types/task'
import { TASK_PRIORITY_META } from '../types/task'
import { Icon } from './Icon'

interface TaskDialogProps {
  open: boolean
  onClose: () => void
  /** Existing task to edit; omit to create a new one. */
  task?: Task | null
  /** Pre-filled due date when creating from the calendar. */
  initialDate?: string | null
  /** Optional callback after a successful save/delete. */
  onSaved?: () => void
}

const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low']

export default function TaskDialog({ open, onClose, task, initialDate, onSaved }: TaskDialogProps) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string>('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (task) {
      setTitle(task.title)
      setDueDate(task.dueDate ?? '')
      setPriority(task.priority)
      setCompleted(task.completed)
    } else {
      setTitle('')
      setDueDate(initialDate ?? '')
      setPriority('medium')
      setCompleted(false)
    }
    setError(null)
  }, [open, task, initialDate])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('할 일 제목을 입력하세요.')
      return
    }
    const payload = {
      title: title.trim(),
      dueDate: dueDate || null,
      priority,
      completed,
    }
    if (task) {
      taskService.updateTask(task.id, payload)
    } else {
      taskService.createTask(payload)
    }
    onSaved?.()
    onClose()
  }

  const handleDelete = () => {
    if (!task) return
    if (!confirm('이 할 일을 삭제하시겠습니까?')) return
    taskService.deleteTask(task.id)
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-surface-container rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-outline-variant">
          <h2 className="font-h2 text-h2 text-on-surface">{task ? '할 일 수정' : '새 할 일'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
            <Icon name="close" className="text-on-surface-variant" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-error-container rounded-lg border border-error">
              <p className="text-error text-body-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-label text-on-surface mb-1.5">
              제목 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary"
              placeholder="할 일을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-label text-on-surface mb-1.5">마감일</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-label text-on-surface mb-1.5">우선순위</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const meta = TASK_PRIORITY_META[p]
                const selected = priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-label transition-all ${
                      selected ? 'border-transparent text-white' : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                    style={selected ? { backgroundColor: meta.color } : undefined}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: selected ? '#ffffff' : meta.color }}
                    />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              className="w-5 h-5 rounded border-outline text-primary focus:ring-primary"
            />
            <span className="text-body text-on-surface">완료됨으로 표시</span>
          </label>

          <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
            {task ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-error text-on-error rounded-lg font-label hover:bg-error/90 transition-colors"
              >
                삭제
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg font-label hover:bg-surface-container-highest transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label hover:bg-primary/90 transition-colors"
              >
                {task ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
