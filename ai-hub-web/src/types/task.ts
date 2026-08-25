export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  /** Due date in YYYY-MM-DD, or null when no date is set. */
  dueDate: string | null
  priority: TaskPriority
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  dueDate?: string | null
  priority?: TaskPriority
  completed?: boolean
}

export interface UpdateTaskInput {
  title?: string
  dueDate?: string | null
  priority?: TaskPriority
  completed?: boolean
}

export interface TaskPriorityMeta {
  label: string
  /** Hex color used for calendar markers and priority bars. */
  color: string
}

// Priority colors double as the "색상 표시" shown on the calendar.
export const TASK_PRIORITY_META: Record<TaskPriority, TaskPriorityMeta> = {
  high: { label: '높음', color: '#ef4444' },
  medium: { label: '보통', color: '#f59e0b' },
  low: { label: '낮음', color: '#6366f1' },
}
