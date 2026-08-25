import { Icon } from '../components/Icon'
import type { AppPlugin } from './types'

const MESSAGES = [
  {
    icon: 'account_circle',
    title: 'Technical Support',
    time: '10:45 AM',
    body: 'Your request #8292 for module expansion has been...',
    highlight: true,
  },
  {
    icon: 'group',
    title: 'Product Team',
    time: 'Yesterday',
    body: 'New design system guidelines are now live on the hub.',
    highlight: false,
  },
]

function MessagesBody() {
  return (
    <div className="space-y-4">
      {MESSAGES.map((m) => (
        <div
          key={m.title}
          className={`flex items-start gap-4 p-3 rounded-lg transition-all cursor-pointer ${
            m.highlight
              ? 'bg-surface-container-high border border-outline-variant hover:shadow-md'
              : 'border border-transparent hover:bg-surface-container-low hover:border-outline-variant'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-surface-dim flex-shrink-0 flex items-center justify-center border border-outline-variant">
            <Icon name={m.icon} className="text-on-surface-variant" />
          </div>
          <div className="flex-grow min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="font-h3 text-h3 text-on-surface truncate">{m.title}</span>
              <span className="text-caption text-on-surface-variant">{m.time}</span>
            </div>
            <p className="text-body-sm text-on-surface-variant truncate">{m.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesHeaderExtra() {
  return (
    <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full text-[10px] font-bold">
      2 NEW
    </span>
  )
}

export const messagesApp: AppPlugin = {
  id: 'recent-messages',
  name: '메시지',
  icon: 'mail',
  description: '최근에 도착한 메시지와 알림을 확인합니다.',
  category: '생산성',
  version: '1.0.0',
  defaultSize: { w: 4, h: 4, minW: 3, minH: 2 },
  Body: MessagesBody,
  HeaderExtra: MessagesHeaderExtra,
}
