import type { Task, CreateTaskInput, UpdateTaskInput } from '../types/task'
import { getMonthDateRange } from './dateUtils'
import { getUserScopedItem, setUserScopedItem } from './userScopedStorage'

const STORAGE_KEY = 'ai-hub-tasks-v1'

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to task changes. Returns an unsubscribe function. */
export function subscribeTasks(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l()
    } catch (err) {
      console.error('task listener failed:', err)
    }
  })
}

function read(): Task[] {
  try {
    const raw = getUserScopedItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Task[]
  } catch (err) {
    console.error('Failed to load tasks:', err)
    return []
  }
}

function write(tasks: Task[]): void {
  setUserScopedItem(STORAGE_KEY, JSON.stringify(tasks))
}

// Incomplete first, then by due date (undated last), then by created time.
function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    const ad = a.dueDate ?? '9999-12-31'
    const bd = b.dueDate ?? '9999-12-31'
    if (ad !== bd) return ad.localeCompare(bd)
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export const taskService = {
  getTasks(): Task[] {
    return sortTasks(read())
  },

  getTasksByMonth(year: number, month: number): Task[] {
    const { startDate, endDate } = getMonthDateRange(year, month)
    return sortTasks(read()).filter((t) => t.dueDate && t.dueDate >= startDate && t.dueDate <= endDate)
  },

  getTasksByDate(date: string): Task[] {
    return sortTasks(read()).filter((t) => t.dueDate === date)
  },

  getTaskById(id: string): Task | null {
    return read().find((t) => t.id === id) ?? null
  },

  createTask(input: CreateTaskInput): Task {
    const tasks = read()
    const now = new Date().toISOString()
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? 'medium',
      completed: input.completed ?? false,
      createdAt: now,
      updatedAt: now,
    }
    tasks.push(task)
    write(tasks)
    notify()
    return task
  },

  updateTask(id: string, updates: UpdateTaskInput): Task | null {
    const tasks = read()
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) return null
    const updated: Task = {
      ...tasks[index],
      ...updates,
      title: updates.title !== undefined ? updates.title.trim() : tasks[index].title,
      updatedAt: new Date().toISOString(),
    }
    tasks[index] = updated
    write(tasks)
    notify()
    return updated
  },

  toggleTask(id: string): void {
    const tasks = read()
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) return
    tasks[index] = {
      ...tasks[index],
      completed: !tasks[index].completed,
      updatedAt: new Date().toISOString(),
    }
    write(tasks)
    notify()
  },

  deleteTask(id: string): void {
    const tasks = read().filter((t) => t.id !== id)
    write(tasks)
    notify()
  },
}
