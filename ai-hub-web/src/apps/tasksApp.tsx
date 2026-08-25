import TasksWidget from '../components/TasksWidget'
import type { AppPlugin } from './types'

export const tasksApp: AppPlugin = {
  id: 'pending-tasks',
  name: '할 일',
  icon: 'task_alt',
  description: '마감일과 함께 할 일을 관리하고 캘린더와 연동되는 작업 목록 앱입니다.',
  category: '생산성',
  version: '1.1.0',
  defaultSize: { w: 6, h: 5, minW: 3, minH: 2 },
  defaultActive: true,
  Body: () => <TasksWidget />,
}
