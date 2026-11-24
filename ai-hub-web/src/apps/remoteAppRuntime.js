import React from 'react'
import { createRoot } from 'react-dom/client'

let root
let channel
let initialized = false
let updateContext
const send = (type, extra = {}) => parent.postMessage({ type, channel, ...extra }, '*')
window.addEventListener('message', async (event) => {
  if (event.source !== parent || event.data?.type !== 'aihub:init') return
  const data = event.data
  if (initialized) { if (data.channel === channel) updateContext?.(data.context); return }
  initialized = true
  channel = data.channel
  let url
  try {
    if (data.storage) {
      const values = new Map(Object.entries(data.storage))
      const sync = () => send('aihub:storage', { values: Object.fromEntries(values) })
      const storage = { get length() { return values.size }, key: (i) => [...values.keys()][i] ?? null,
        getItem: (key) => values.get(String(key)) ?? null,
        setItem: (key, value) => { if (values.size < 100 && String(value).length <= 60000) { values.set(String(key), String(value)); sync() } },
        removeItem: (key) => { values.delete(String(key)); sync() }, clear: () => { values.clear(); sync() } }
      Object.defineProperty(window, 'localStorage', { value: storage })
      Object.defineProperty(window, 'sessionStorage', { value: storage })
    }
    url = URL.createObjectURL(new Blob([data.code], { type: 'text/javascript' }))
    const module = await import(/* @vite-ignore */ url)
    if (typeof module.default !== 'function') throw Error('default 앱 팩토리가 없습니다.')
    const plugin = await module.default({ React })
    if (typeof plugin?.Body !== 'function') throw Error('Body 컴포넌트가 없습니다.')
    function App() {
      const [state, setState] = React.useState(data.context)
      updateContext = setState
      const context = { ...state, toggleMaximize: () => send('aihub:toggle'), remove: () => send('aihub:remove') }
      const body = React.createElement(React.Fragment, null,
        typeof plugin.HeaderExtra === 'function' ? React.createElement(plugin.HeaderExtra, context) : null,
        React.createElement(plugin.Body, context))
      return typeof plugin.Provider === 'function' ? React.createElement(plugin.Provider, { ctx: context }, body) : body
    }
    root = createRoot(document.getElementById('root'))
    root.render(React.createElement(App))
  } catch (error) { send('aihub:error', { message: error.message }) }
  finally { if (url) URL.revokeObjectURL(url) }
})
window.addEventListener('error', (event) => send('aihub:error', { message: event.message }))
window.addEventListener('unhandledrejection', (event) => send('aihub:error', { message: String(event.reason?.message || event.reason) }))
parent.postMessage({ type: 'aihub:ready' }, '*')
