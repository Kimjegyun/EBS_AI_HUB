import { useState } from 'react'
import type { AppPlugin } from './types'
import { getUserScopedItem, setUserScopedItem } from '../lib/userScopedStorage'

const STORAGE_KEY = 'widget-notes'

function NotesBody() {
  const [text, setText] = useState(() => getUserScopedItem(STORAGE_KEY) ?? '')
  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setUserScopedItem(STORAGE_KEY, e.target.value)
      }}
      placeholder="메모를 입력하세요..."
      className="no-drag w-full h-full min-h-[80px] resize-none bg-transparent outline-none text-body text-on-surface placeholder:text-on-surface-variant"
    />
  )
}

export const notesApp: AppPlugin = {
  id: 'notes',
  name: '메모',
  icon: 'sticky_note_2',
  description: '간단한 메모를 작성하고 저장하는 메모장 앱입니다.',
  category: '생산성',
  version: '1.0.0',
  defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
  Body: NotesBody,
}
