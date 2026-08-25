import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import {
  clearIoLog,
  formatIoLog,
  getIoLog,
  subscribeIoLog,
  type IoLogEntry,
} from '../lib/ioLog'

export default function IoLogPage() {
  const [entries, setEntries] = useState<IoLogEntry[]>(() => getIoLog())
  const [copied, setCopied] = useState(false)
  const scrollerRef = useRef<HTMLPreElement>(null)
  const text = useMemo(() => formatIoLog(entries), [entries])

  useEffect(() => {
    document.title = '입출력 로그 · EBS AI 허브'
  }, [])

  useEffect(() => subscribeIoLog(setEntries), [])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [text])

  const copyAll = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex h-[100svh] flex-col bg-[#0f1419] text-[#d7e0ea]">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Icon name="terminal" className="text-[20px] text-emerald-300" />
        <div className="min-w-0">
          <h1 className="font-h3 text-h3 text-white">명령 로그</h1>
          <p className="text-caption text-white/50">
            프로그램 입출력을 명령·요청·응답 단위로 분석합니다. 로그인 화면이 아닙니다.
          </p>
        </div>
        <span className="ml-auto text-caption text-white/45">{entries.length}건</span>
        <button
          type="button"
          onClick={() => void copyAll()}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-white/15 px-2 text-caption text-white/80 hover:bg-white/10"
        >
          <Icon name={copied ? 'check' : 'content_copy'} className="text-[16px]" />
          {copied ? '복사됨' : '복사'}
        </button>
        <button
          type="button"
          onClick={() => void clearIoLog()}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-white/15 px-2 text-caption text-white/80 hover:bg-white/10"
        >
          <Icon name="delete" className="text-[16px]" />
          지우기
        </button>
      </header>
      <pre
        ref={scrollerRef}
        className="custom-scrollbar min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-5 text-[#c8d6e5]"
      >
        {text}
      </pre>
    </div>
  )
}
