/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { authHeaders, describeAuthStatus } from '../lib/authHeaders'
import { exportToDocx, exportToHwp, exportToTxt } from '../lib/exportDocument'
import { updateMyLlmState } from './myLlmStore'
import { deleteVoiceProject, getVoiceProject, listVoiceProjects, saveVoiceProject, type StoredVoiceProject } from './voiceSummaryStorage'
import type { AppPlugin } from './types'

const MAX_SIZE = 50 * 1024 * 1024
const ACCEPTED = /\.(m4a|mp3|mp4|mpeg|mpga|wav|webm|ogg|oga|flac)$/i
const MP4_EPOCH = 2_082_844_800
type Summary = { title: string; overview: string; keyPoints: string[]; actionItems: string[] }
type FileTime = { createdAt: number; source: 'metadata' | 'file' }
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`

function parseSummary(raw: string): Summary {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const v = JSON.parse(clean) as Partial<Summary>
    return { title: typeof v.title === 'string' ? v.title : '음성 내용 요약', overview: typeof v.overview === 'string' ? v.overview : '', keyPoints: Array.isArray(v.keyPoints) ? v.keyPoints.filter((x): x is string => typeof x === 'string') : [], actionItems: Array.isArray(v.actionItems) ? v.actionItems.filter((x): x is string => typeof x === 'string') : [] }
  } catch { return { title: '음성 내용 요약', overview: clean, keyPoints: [], actionItems: [] } }
}
function summaryText(s: Summary | null) {
  return s ? [`# ${s.title}`, '', s.overview, '', '## 핵심 내용', ...s.keyPoints.map((x) => `- ${x}`), ...(s.actionItems.length ? ['', '## 후속 조치', ...s.actionItems.map((x) => `- ${x}`)] : [])].join('\n') : ''
}
const safeName = (s: string) => (s || '음성요약').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || '음성요약'
function uint64(v: DataView, i: number) { return v.getUint32(i, false) * 4_294_967_296 + v.getUint32(i + 4, false) }
async function fileTime(file: File): Promise<FileTime> {
  if (/\.(m4a|mp4)$/i.test(file.name)) try {
    const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer), view = new DataView(buffer)
    for (let i = 4; i + 20 < bytes.length; i += 1) if (bytes[i] === 109 && bytes[i + 1] === 118 && bytes[i + 2] === 104 && bytes[i + 3] === 100) {
      const seconds = bytes[i + 4] === 1 ? uint64(view, i + 8) : view.getUint32(i + 8, false)
      const createdAt = (seconds - MP4_EPOCH) * 1000
      if (createdAt >= Date.UTC(2000, 0, 1) && createdAt <= Date.now() + 86_400_000) return { createdAt, source: 'metadata' }
    }
  } catch { /* 파일 수정 시각으로 대체 */ }
  return { createdAt: file.lastModified || Date.now(), source: 'file' }
}

function VoiceSummaryBody() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([]), [times, setTimes] = useState<Record<string, FileTime>>({})
  const [transcript, setTranscript] = useState(''), [summary, setSummary] = useState<Summary | null>(null)
  const [stage, setStage] = useState<'idle'|'ordering'|'transcribing'|'summarizing'>('idle')
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [copied, setCopied] = useState(false), [currentFile, setCurrentFile] = useState(0)
  const [projects, setProjects] = useState<StoredVoiceProject[]>([]), [projectId, setProjectId] = useState(''), [projectName, setProjectName] = useState('새 음성 프로젝트')
  const [orderOpen, setOrderOpen] = useState(false)
  const refresh = async () => setProjects(await listVoiceProjects())
  useEffect(() => { void refresh().catch(() => setError('프로젝트 목록을 불러오지 못했습니다.')) }, [])

  async function chooseFiles(next: File[]) {
    setError(''); setMessage(''); setSummary(null); setTranscript('')
    if (!next.length) return
    const badSize = next.find((f) => f.size > MAX_SIZE), badType = next.find((f) => !/^(audio|video)\//.test(f.type) && !ACCEPTED.test(f.name))
    if (badSize) { setFiles([]); setError(`${badSize.name}: 파일 한 개당 최대 50MB까지 업로드할 수 있습니다.`); return }
    if (badType) { setFiles([]); setError(`${badType.name}: 지원하지 않는 파일 형식입니다.`); return }
    setStage('ordering')
    try {
      const rows = await Promise.all(next.map(async (file, index) => ({ file, index, time: await fileTime(file) })))
      rows.sort((a, b) => a.time.createdAt - b.time.createdAt || a.index - b.index)
      setFiles(rows.map((r) => r.file)); setTimes(Object.fromEntries(rows.map((r) => [keyOf(r.file), r.time])))
      setOrderOpen(false)
      setMessage('원본 생성 시각 기준으로 오래된 파일부터 자동 정렬했습니다. 화살표로 직접 조정할 수도 있습니다.')
    } finally { setStage('idle') }
  }
  function move(index: number, by: -1|1) {
    const target = index + by; if (target < 0 || target >= files.length) return
    setFiles((old) => { const next = [...old]; [next[index], next[target]] = [next[target], next[index]]; return next }); setTranscript(''); setSummary(null); setMessage('처리 순서를 직접 변경했습니다.')
  }
  function newProject() { setProjectId(''); setProjectName('새 음성 프로젝트'); setFiles([]); setTimes({}); setTranscript(''); setSummary(null); setError(''); setMessage('새 프로젝트를 시작했습니다.') }
  async function saveProject() {
    if (!files.length && !transcript.trim()) { setError('저장할 음성 파일이나 STT 내용이 없습니다.'); return }
    const old = projects.find((p) => p.id === projectId), id = projectId || crypto.randomUUID(), now = new Date().toISOString()
    await saveVoiceProject({ id, name: projectName.trim() || '음성 프로젝트', createdAt: old?.createdAt ?? now, updatedAt: now, transcript, summaryText: summaryText(summary), summaryJson: summary ? JSON.stringify(summary) : undefined, files: files.map((f) => ({ name: f.name, type: f.type, lastModified: f.lastModified, createdAt: times[keyOf(f)]?.createdAt ?? f.lastModified, blob: f })) })
    setProjectId(id); await refresh(); setError(''); setMessage('음성 원본, STT, 요약을 이 브라우저에 저장했습니다.')
  }
  async function loadProject(id: string) {
    if (!id) { newProject(); return }
    const p = await getVoiceProject(id); if (!p) return
    const restored = p.files.map((f) => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified }))
    setProjectId(p.id); setProjectName(p.name); setFiles(restored); setOrderOpen(false); setTranscript(p.transcript); setSummary(p.summaryJson ? parseSummary(p.summaryJson) : p.summaryText ? parseSummary(p.summaryText) : null)
    setTimes(Object.fromEntries(restored.map((f, i) => [keyOf(f), { createdAt: p.files[i].createdAt, source: 'metadata' as const }]))); setMessage(`'${p.name}' 프로젝트를 불러왔습니다.`); setError('')
  }
  async function removeProject() { if (!projectId || !confirm(`'${projectName}' 프로젝트와 저장된 음성을 삭제할까요?`)) return; await deleteVoiceProject(projectId); await refresh(); newProject() }

  async function transcribe() {
    if (!files.length || stage !== 'idle') return
    setStage('transcribing'); setCurrentFile(0); setError(''); setSummary(null)
    try {
      const parts: string[] = []
      for (let i = 0; i < files.length; i += 1) {
        setCurrentFile(i + 1); const form = new FormData(); form.append('file', files[i]); form.append('language', 'ko')
        const response = await fetch('/api/ai/transcribe', { method: 'POST', headers: authHeaders(), body: form })
        const body = await response.json().catch(() => null) as {ok?:boolean;text?:string;error?:string}|null
        if (!response.ok || !body?.ok || !body.text) throw new Error(`${i + 1}번 파일(${files[i].name}): ${describeAuthStatus(response.status) ?? body?.error ?? `음성 인식에 실패했습니다. (${response.status})`}`)
        parts.push(`[${i + 1}번 파일: ${files[i].name}]\n${body.text}`)
      }
      setTranscript(parts.join('\n\n'))
    } catch (e) { setError(e instanceof Error ? e.message : '음성 인식 중 오류가 발생했습니다.') } finally { setStage('idle') }
  }
  async function summarize() {
    if (!transcript.trim() || stage !== 'idle') return
    setStage('summarizing'); setError('')
    try {
      const response = await fetch('/api/ai/voice-summary', { method: 'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ transcript: transcript.trim() }) })
      const body = await response.json().catch(() => null) as {ok?:boolean;content?:string;error?:string}|null
      if (response.ok && body?.ok && body.content) setSummary(parseSummary(body.content)); else setError(describeAuthStatus(response.status) ?? body?.error ?? `요약에 실패했습니다. (${response.status})`)
    } catch { setError('Together AI 요약 서버에 연결하지 못했습니다.') } finally { setStage('idle') }
  }
  function exports(content: string, suffix: string) {
    const name = `${safeName(projectName)}_${suffix}`
    return <div className="flex gap-1"><button onClick={() => exportToTxt(content, name)} className="rounded-md border px-2 py-1 text-caption">TXT</button><button onClick={() => void exportToDocx(content, name)} className="rounded-md border px-2 py-1 text-caption">Word</button><button title="한컴오피스에서 열 수 있는 HWP 호환 문서" onClick={() => exportToHwp(content, name)} className="rounded-md border px-2 py-1 text-caption">한글</button></div>
  }
  function sendToLlm() {
    if (!summary) return
    updateMyLlmState((s) => ({ ...s, sharedInput: `다음 음성 요약과 STT 원문을 바탕으로 대화형으로 내용을 수정하고, 요청에 따라 완성된 보고서를 작성해 주세요.\n\n${summaryText(summary)}\n\n# STT 원문\n${transcript}`, leftPane: {...s.leftPane, mode:'document summary'}, rightPane: {...s.rightPane, mode:'document summary'} }))
    setMessage("'나만의 LLM' 입력창에 전달했습니다. 앱을 열어 모델을 선택하고 대화를 시작하세요.")
  }

  return <div className="no-drag flex h-full min-h-[430px] flex-col gap-3 overflow-auto">
    <div className="grid gap-2 rounded-xl border bg-white p-3 md:grid-cols-[1fr_1fr_auto]"><select value={projectId} onChange={(e) => void loadProject(e.target.value)} className="rounded-lg border px-3 py-2"><option value="">새 프로젝트</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="rounded-lg border px-3 py-2"/><div className="flex gap-1"><button onClick={newProject} className="rounded-lg border px-3">새로 만들기</button><button onClick={() => void saveProject()} className="rounded-lg bg-primary px-3 text-white">전체 저장</button>{projectId && <button onClick={() => void removeProject()} className="rounded-lg border p-2 text-error"><Icon name="delete"/></button>}</div></div>
    {!files.length ? <button onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {e.preventDefault(); void chooseFiles([...e.dataTransfer.files])}} className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-surface-container-low p-5"><Icon name="audio_file" className="text-4xl text-primary"/><b>음성 파일을 여러 개 끌어놓거나 선택하세요</b><span className="text-caption text-on-surface-variant">Android M4A 포함 · 파일당 최대 50MB · 원본 생성 시각 자동 정렬</span></button> : <div className="overflow-hidden rounded-xl border bg-surface-container-low"><div className="flex items-center justify-between gap-3 px-3 py-2.5"><button type="button" aria-expanded={orderOpen} onClick={() => setOrderOpen((open) => !open)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><Icon name={orderOpen ? 'expand_less' : 'expand_more'} className="text-xl text-primary"/><b>처리 순서 · {files.length}개</b><span className="truncate text-caption text-on-surface-variant">원본 생성 시각 기준</span></button><button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 text-caption font-medium text-primary">다시 선택</button></div>{orderOpen && <div className="max-h-56 space-y-1 overflow-auto border-t px-3 py-2">{files.map((f,i) => {const t=times[keyOf(f)]; return <div key={`${keyOf(f)}-${i}`} className="flex items-center gap-2 rounded-lg bg-white p-2"><span className="rounded-full bg-primary/10 px-2 py-1 font-bold text-primary">{i+1}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{f.name}</p><p className="text-caption text-on-surface-variant">{(f.size/1048576).toFixed(1)}MB · {t ? new Date(t.createdAt).toLocaleString('ko-KR') : '-'} ({t?.source==='metadata'?'원본 생성':'파일 수정'})</p></div><button aria-label="위로 이동" disabled={i===0} onClick={() => move(i,-1)}><Icon name="arrow_upward"/></button><button aria-label="아래로 이동" disabled={i===files.length-1} onClick={() => move(i,1)}><Icon name="arrow_downward"/></button><button aria-label="파일 제거" onClick={() => {setFiles((x)=>x.filter((_,n)=>n!==i));setTranscript('');setSummary(null)}}><Icon name="close"/></button></div>})}</div>}</div>}
    <input ref={inputRef} type="file" multiple className="hidden" accept="audio/*,.m4a,.mp3,.wav,.ogg,.flac,video/mp4,video/webm" onChange={(e)=>{void chooseFiles([...(e.target.files??[])]);e.target.value=''}}/>
    {transcript && <div className="grid min-h-[230px] flex-1 gap-3 lg:grid-cols-2"><section className="flex flex-col rounded-xl border bg-surface-container-low p-3"><div className="mb-2 flex justify-between"><h3 className="font-h3 text-h3">전체 STT 원문</h3>{exports(transcript,'전체_STT')}</div><textarea value={transcript} onChange={(e)=>{setTranscript(e.target.value);setSummary(null)}} className="min-h-[160px] flex-1 rounded-lg border-0 bg-white p-3"/></section><section className="flex flex-col rounded-xl border bg-white p-3"><div className="mb-2 flex flex-wrap justify-between gap-2"><h3 className="font-h3 text-h3">내용 요약</h3>{summary && exports(summaryText(summary),'요약')}</div>{summary ? <div className="space-y-3 overflow-auto"><h3 className="font-h3 text-h3">{summary.title}</h3><p>{summary.overview}</p><b>핵심 내용</b><ul className="pl-5">{summary.keyPoints.map((x,i)=><li className="list-disc" key={i}>{x}</li>)}</ul>{summary.actionItems.length>0&&<><b>후속 조치</b><ul className="pl-5">{summary.actionItems.map((x,i)=><li className="list-disc" key={i}>{x}</li>)}</ul></>}<div className="flex gap-2"><button onClick={() => void navigator.clipboard.writeText(summaryText(summary)).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500)})} className="rounded-lg border px-3 py-2">{copied?'복사됨':'복사'}</button><button onClick={sendToLlm} className="rounded-lg bg-secondary-container px-3 py-2"><Icon name="forum"/> 나만의 LLM으로 보내기</button></div></div>:<div className="flex flex-1 items-center justify-center text-on-surface-variant">원문 확인 후 요약을 시작하세요.</div>}</section></div>}
    {message&&<p className="rounded-lg bg-primary/10 p-2 text-primary">{message}</p>}{error&&<p role="alert" className="rounded-lg bg-error-container p-2 text-error">{error}</p>}
    <button onClick={transcript?summarize:transcribe} disabled={(!files.length&&!transcript)||stage!=='idle'} className="rounded-lg bg-primary p-3 font-bold text-white disabled:opacity-40">{stage==='ordering'?'원본 생성 시각 확인 및 정렬 중...':stage==='transcribing'?`${currentFile}/${files.length} 파일 STT 중...`:stage==='summarizing'?'전체 흐름 요약 중...':transcript?(summary?'다시 요약하기':'전체 내용 정리 및 요약'):`${files.length||''}개 음성 인식 시작`}</button>
  </div>
}

export const voiceSummaryApp: AppPlugin = { id:'voice-summary', name:'음성 요약', icon:'record_voice_over', description:'여러 음성을 원본 생성 시각 순서로 연결해 STT·요약·보고서 작업을 수행합니다.', category:'AI', version:'1.2.0', defaultSize:{w:9,h:7,minW:5,minH:5}, defaultInstalled:true, Body:VoiceSummaryBody }
