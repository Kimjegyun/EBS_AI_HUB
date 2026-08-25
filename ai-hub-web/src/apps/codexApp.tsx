import CodexWidget from '../components/CodexWidget'
import type { AppPlugin } from './types'

export const codexApp: AppPlugin = {
  id: 'codex',
  name: 'Codex',
  icon: 'smart_toy',
  description: 'OpenAI API 키로 연동하는 코딩 어시스턴트입니다. 설정에서 키를 입력해 사용하세요.',
  category: 'AI',
  version: '1.0.0',
  defaultSize: { w: 5, h: 5, minW: 3, minH: 3 },
  defaultActive: true,
  Body: () => <CodexWidget />,
}
