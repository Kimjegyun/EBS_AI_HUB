import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import type { AppPlugin } from './types'

const LINKS = [
  { name: '마켓플레이스', to: '/marketplace', icon: 'storefront' },
  { name: '설치된 앱', to: '/installed-apps', icon: 'apps' },
  { name: '사용자 관리', to: '/users', icon: 'group' },
]

function BookmarksBody() {
  return (
    <div className="space-y-2">
      {LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="flex items-center gap-3 p-2 rounded-lg border border-outline-variant hover:border-primary hover:bg-surface-container-high transition-colors"
        >
          <Icon name={l.icon} className="text-primary" />
          <span className="text-body text-on-surface">{l.name}</span>
        </Link>
      ))}
    </div>
  )
}

export const bookmarksApp: AppPlugin = {
  id: 'bookmarks',
  name: '바로가기',
  icon: 'bookmark',
  description: '자주 방문하는 페이지로 이동하는 링크 모음입니다.',
  category: '생산성',
  version: '1.0.0',
  defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
  Body: BookmarksBody,
}
