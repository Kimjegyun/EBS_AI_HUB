/**
 * DocumentGeneratorModal
 * 세 가지 모드:
 *  1. 빈 문서 (blank): 주제 입력 → AI 생성 → .docx / .pdf / .png 다운로드
 *  2. 템플릿 (template): .docx 업로드 → 구조 분석 → AI 작성 → .docx / .pdf / .png
 *  3. PDF 분석 (pdf): .pdf 업로드 → 텍스트 추출 → AI 분석/요약 → .docx / .pdf / .png
 * 이미지(jpg/png) 업로드 → AI 설명 생성 → .docx / .pdf / .png 도 지원
 */

import { useRef, useState } from 'react'
import { Icon } from './Icon'
import {
  extractDocxStructure, exportToDocx, exportToPdf, exportToImage,
  extractPdfText,
  type DocxStructure, type PdfExtractResult,
} from '../lib/exportDocument'
import { tencentComplete } from '../lib/tencentClient'
import { findTencentModel, getTencentSettings } from '../lib/tencentSettings'
import { enabledTencentModels } from '../lib/tencentCatalog'

type Step = 'input' | 'generating' | 'preview' | 'done'
type Mode = 'blank' | 'template' | 'pdf' | 'image'
type OutputFormat = 'docx' | 'pdf' | 'png'

function getFirstEnabledModel(): string {
  const models = enabledTencentModels(getTencentSettings().models)
  return models[0]?.id ?? ''
}

const OUTPUT_FORMATS: { id: OutputFormat; icon: string; label: string; color: string }[] = [
  { id: 'docx', icon: 'description',    label: '.docx',  color: 'bg-primary text-on-primary border-primary' },
  { id: 'pdf',  icon: 'picture_as_pdf', label: '.pdf',   color: 'bg-error text-white border-error' },
  { id: 'png',  icon: 'image',          label: '.png',   color: 'bg-emerald-600 text-white border-emerald-600' },
]

export default function DocumentGeneratorModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('blank')
  const [step, setStep] = useState<Step>('input')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('docx')

  // blank 모드
  const [topic, setTopic] = useState('')
  const [docType, setDocType] = useState('보고서')
  const [extraInstructions, setExtraInstructions] = useState('')

  // template 모드
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [templateStructure, setTemplateStructure] = useState<DocxStructure | null>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateContent, setTemplateContent] = useState('')

  // pdf 모드
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfResult, setPdfResult] = useState<PdfExtractResult | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfInstruction, setPdfInstruction] = useState('요약해줘')

  // image 모드
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [imageInstruction, setImageInstruction] = useState('이 이미지를 분석하고 내용을 설명해줘')

  // 공통
  const [generatedText, setGeneratedText] = useState('')
  const [outputFilename, setOutputFilename] = useState('문서')
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const templateInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // ── 템플릿 파일 업로드 ─────────────────────────────────────────────────────
  const handleTemplateUpload = async (file: File) => {
    setTemplateFile(file)
    setTemplateLoading(true)
    setError('')
    try {
      const structure = await extractDocxStructure(file)
      setTemplateStructure(structure)
      setOutputFilename(structure.filename || '문서')
    } catch {
      setError('파일을 읽지 못했습니다. .docx 형식인지 확인해 주세요.')
      setTemplateFile(null)
    } finally {
      setTemplateLoading(false)
    }
  }

  // ── PDF 파일 업로드 ────────────────────────────────────────────────────────
  const handlePdfUpload = async (file: File) => {
    setPdfFile(file)
    setPdfLoading(true)
    setError('')
    try {
      const result = await extractPdfText(file)
      setPdfResult(result)
      setOutputFilename(result.filename || '분석결과')
    } catch {
      setError('PDF를 읽지 못했습니다. 스캔 PDF이거나 보호된 파일일 수 있습니다.')
      setPdfFile(null)
    } finally {
      setPdfLoading(false)
    }
  }

  // ── 이미지 파일 업로드 ──────────────────────────────────────────────────────
  const handleImageUpload = (file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageDataUrl((e.target?.result as string) ?? '')
    }
    reader.readAsDataURL(file)
    setOutputFilename(file.name.replace(/\.[^.]+$/, '') || '이미지분석')
  }

  // ── AI 생성 ────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (mode === 'blank' && !topic.trim()) { setError('주제를 입력해 주세요.'); return }
    if (mode === 'template' && !templateStructure) { setError('템플릿 파일을 업로드해 주세요.'); return }
    if (mode === 'template' && !templateContent.trim()) { setError('작성할 내용을 설명해 주세요.'); return }
    if (mode === 'pdf' && !pdfResult) { setError('PDF 파일을 업로드해 주세요.'); return }
    if (mode === 'image' && !imageDataUrl) { setError('이미지 파일을 업로드해 주세요.'); return }

    setError('')
    setStep('generating')

    const modelId = getFirstEnabledModel()
    if (!modelId) {
      setError('활성화된 AI 모델이 없습니다. ADMIN 설정에서 모델을 켜 주세요.')
      setStep('input')
      return
    }
    const selected = findTencentModel(modelId)
    if (!selected?.apiUrl) {
      setError('선택된 모델의 API 주소가 없습니다. ADMIN 설정을 확인해 주세요.')
      setStep('input')
      return
    }

    try {
      let systemPrompt: string
      const userMessages: Array<{ role: 'system' | 'user'; content: string }> = []

      if (mode === 'blank') {
        systemPrompt =
          `당신은 전문 문서 작성 AI입니다. 사용자의 요청에 따라 한국어로 완성도 높은 ${docType}를 작성합니다. ` +
          `Markdown 형식으로 작성하며, 제목은 #, 소제목은 ##/###, 목록은 - 또는 숫자., 강조는 **굵게**를 사용합니다. ` +
          `문서는 목차, 서론, 본론, 결론의 구성을 갖추고 충분한 내용으로 작성합니다.`
        userMessages.push({
          role: 'user',
          content: `다음 주제로 ${docType}를 작성해 주세요:\n\n주제: ${topic.trim()}` +
            (extraInstructions.trim() ? `\n\n추가 지시사항: ${extraInstructions.trim()}` : ''),
        })
        setOutputFilename(topic.slice(0, 30) || '문서')

      } else if (mode === 'template') {
        const structureDesc = templateStructure!.rawText.slice(0, 3000)
        systemPrompt =
          `당신은 문서 형식 분석 및 작성 전문 AI입니다. ` +
          `사용자가 제공한 문서 템플릿의 구조(섹션, 제목, 항목, 형식)를 파악하고, ` +
          `해당 형식을 그대로 유지하면서 내용을 새롭게 작성합니다. ` +
          `Markdown으로 출력하되, 원본 문서 구조를 최대한 보존합니다.`
        userMessages.push({
          role: 'user',
          content: `아래는 템플릿 문서의 구조/내용입니다:\n\n---\n${structureDesc}\n---\n\n` +
            `위 문서 형식과 구조를 유지하면서 다음 내용으로 새 문서를 작성해 주세요:\n\n${templateContent.trim()}`,
        })
        setOutputFilename(templateStructure?.filename ?? '문서')

      } else if (mode === 'pdf') {
        const pdfText = pdfResult!.text.slice(0, 8000)
        systemPrompt =
          `당신은 문서 분석 전문 AI입니다. 사용자가 제공한 PDF 문서의 내용을 분석하고 ` +
          `사용자의 지시에 따라 요약, 분석, 변환 등의 작업을 수행합니다. ` +
          `결과는 Markdown 형식으로 작성하고, 핵심 내용을 명확하게 전달합니다.`
        userMessages.push({
          role: 'user',
          content: `아래는 PDF 문서 (${pdfResult!.filename}, ${pdfResult!.pageCount}페이지) 의 내용입니다:\n\n` +
            `---\n${pdfText}${pdfResult!.text.length > 8000 ? '\n...(이하 생략)' : ''}\n---\n\n` +
            `지시사항: ${pdfInstruction.trim()}`,
        })
        setOutputFilename(`${pdfResult?.filename ?? 'PDF분석'}_${pdfInstruction.slice(0, 10)}`)

      } else {
        // image 모드
        systemPrompt =
          `당신은 이미지 분석 전문 AI입니다. 첨부된 이미지를 분석하고 ` +
          `사용자의 지시에 따라 설명, 분석, 텍스트 추출 등의 작업을 수행합니다. ` +
          `결과는 Markdown 형식으로 작성합니다.`
        userMessages.push({
          role: 'user',
          content: `이미지 파일: ${imageFile?.name ?? '이미지'}\n지시사항: ${imageInstruction.trim()}\n[이미지 데이터: ${imageDataUrl.slice(0, 60)}...]`,
        })
        setOutputFilename(`이미지분석_${imageFile?.name.replace(/\.[^.]+$/, '') ?? ''}`.slice(0, 40))
      }

      const result = await tencentComplete(
        [
          { role: 'system', content: systemPrompt },
          ...userMessages,
        ],
        { model: selected.id, apiUrl: selected.apiUrl },
      )

      if (!result.ok) {
        setError(`AI 오류: ${result.error}`)
        setStep('input')
        return
      }

      setGeneratedText(result.content)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 요청 중 오류가 발생했습니다.')
      setStep('input')
    }
  }

  // ── 결과물 다운로드 ─────────────────────────────────────────────────────────
  const handleDownload = async (format: OutputFormat) => {
    setDownloading(true)
    try {
      if (format === 'docx') {
        await exportToDocx(generatedText, outputFilename)
      } else if (format === 'pdf') {
        await exportToPdf(generatedText, outputFilename)
      } else {
        await exportToImage(generatedText, outputFilename)
      }
      setStep('done')
    } catch {
      setError(`${format.toUpperCase()} 생성 중 오류가 발생했습니다.`)
    } finally {
      setDownloading(false)
    }
  }

  // ── 모드 메타 ───────────────────────────────────────────────────────────────
  const MODES: { id: Mode; icon: string; label: string; desc: string }[] = [
    { id: 'blank',    icon: 'edit_document',  label: '빈 문서 생성',      desc: '주제를 입력하면 AI가 전체 문서를 작성합니다.' },
    { id: 'template', icon: 'file_copy',      label: '.docx 템플릿 기반', desc: 'Word 파일을 업로드하면 해당 형식으로 내용을 채워드립니다.' },
    { id: 'pdf',      icon: 'picture_as_pdf', label: 'PDF 분석/변환',     desc: 'PDF를 업로드하면 AI가 요약·분석·변환합니다.' },
    { id: 'image',    icon: 'image',          label: '이미지 분석',       desc: '이미지를 업로드하면 AI가 내용을 설명·분석합니다.' },
  ]

  // ── 렌더 ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-surface border border-outline-variant shadow-2xl flex flex-col max-h-[92vh]">

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-outline-variant shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Icon name="auto_awesome" className="text-primary text-[20px]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-h2 text-h2 text-on-surface">AI 문서 생성</h2>
            <p className="text-[11px] text-on-surface-variant truncate">
              {step === 'generating' ? 'AI가 문서를 작성 중입니다…' :
               step === 'preview'    ? '생성된 문서를 확인하고 다운로드하세요.' :
               step === 'done'       ? '다운로드가 완료되었습니다.' :
               '빈 문서 · Word 템플릿 · PDF 분석 · 이미지 분석'}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 custom-scrollbar">

          {/* ── 완료 ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                <Icon name="check_circle" className="text-success text-[32px]" />
              </div>
              <p className="font-h3 text-h3 text-on-surface">다운로드 완료!</p>
              <p className="text-body-sm text-on-surface-variant text-center">
                <strong>{outputFilename}.{outputFormat}</strong> 파일이 저장되었습니다.
              </p>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => { setStep('input'); setGeneratedText('') }}
                  className="h-9 rounded-lg border border-outline-variant px-4 text-label text-on-surface-variant hover:bg-surface-container-high">
                  새 문서 만들기
                </button>
                <button type="button" onClick={onClose}
                  className="h-9 rounded-lg bg-primary px-4 text-label text-on-primary hover:bg-primary/90">
                  닫기
                </button>
              </div>
            </div>
          )}

          {/* ── 생성 중 ── */}
          {step === 'generating' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Icon name="progress_activity" className="text-primary text-[40px] animate-spin" />
              <p className="text-body-sm text-on-surface-variant">
                {mode === 'blank'    ? `"${topic}" 문서를 작성하고 있습니다…` :
                 mode === 'template' ? '템플릿 구조를 분석하며 문서를 작성 중입니다…' :
                 mode === 'pdf'      ? 'PDF 내용을 분석하고 있습니다…' :
                                       '이미지를 분석하고 있습니다…'}
              </p>
            </div>
          )}

          {/* ── 미리보기 ── */}
          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-caption text-on-surface-variant shrink-0">파일명:</label>
                <input type="text" value={outputFilename}
                  onChange={(e) => setOutputFilename(e.target.value)}
                  className="flex-1 h-8 rounded-md border border-outline-variant bg-surface px-2.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25" />
                <span className="text-caption text-on-surface-variant shrink-0">.{outputFormat}</span>
              </div>
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 max-h-[320px] overflow-y-auto custom-scrollbar">
                <pre className="text-body-sm text-on-surface whitespace-pre-wrap break-words leading-relaxed font-sans">
                  {generatedText}
                </pre>
              </div>
              {/* 출력 형식 선택 + 다운로드 */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* 포맷 선택 */}
                <div className="flex gap-1">
                  {OUTPUT_FORMATS.map((fmt) => (
                    <button key={fmt.id} type="button"
                      onClick={() => setOutputFormat(fmt.id)}
                      className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-caption font-medium transition-colors ${
                        outputFormat === fmt.id ? fmt.color : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                      }`}>
                      <Icon name={fmt.icon} className="text-[14px]" />
                      {fmt.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setStep('input'); setGeneratedText('') }}
                    className="h-9 rounded-lg border border-outline-variant px-3 text-label text-on-surface-variant hover:bg-surface-container-high flex items-center gap-1">
                    <Icon name="refresh" className="text-[15px]" />
                    다시 생성
                  </button>
                  <button type="button" onClick={() => void handleDownload(outputFormat)} disabled={downloading}
                    className="h-9 rounded-lg bg-primary px-4 text-label text-on-primary hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1.5">
                    {downloading
                      ? <Icon name="progress_activity" className="animate-spin text-[15px]" />
                      : <Icon name="download" className="text-[15px]" />}
                    {downloading ? '생성 중…' : `${outputFormat.toUpperCase()} 다운로드`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 입력 단계 ── */}
          {step === 'input' && (
            <div className="space-y-4">

              {/* 모드 선택 */}
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <button key={m.id} type="button" onClick={() => setMode(m.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                      mode === m.id ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container hover:bg-surface-container-high'
                    }`}>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${mode === m.id ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-primary'}`}>
                      <Icon name={m.icon} className="text-[16px]" />
                    </div>
                    <span className="font-label text-label text-on-surface">{m.label}</span>
                    <span className="text-[11px] text-on-surface-variant leading-snug">{m.desc}</span>
                  </button>
                ))}
              </div>

              {/* ─ 빈 문서 폼 ─ */}
              {mode === 'blank' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">문서 유형</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['보고서', '기획서', '제안서', '분석서', '회의록', '안내문', '이메일', '기타'].map((t) => (
                        <button key={t} type="button" onClick={() => setDocType(t)}
                          className={`h-7 px-3 rounded-full text-caption border transition-colors ${
                            docType === t ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/50 hover:text-primary'
                          }`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      문서 주제 <span className="text-error">*</span>
                    </label>
                    <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2}
                      placeholder={`예: 2024년 4분기 마케팅 전략 ${docType}`}
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25" />
                  </div>
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">추가 지시사항 (선택)</label>
                    <textarea value={extraInstructions} onChange={(e) => setExtraInstructions(e.target.value)} rows={2}
                      placeholder="예: A4 3페이지 분량, 표와 그래프 포함, 학술 문체 사용 등"
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25" />
                  </div>
                </div>
              )}

              {/* ─ 템플릿 폼 ─ */}
              {mode === 'template' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      템플릿 파일 업로드 <span className="text-error">*</span>
                    </label>
                    <input ref={templateInputRef} type="file" accept=".docx,.doc" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleTemplateUpload(f) }} />
                    <button type="button" onClick={() => templateInputRef.current?.click()}
                      className={`w-full h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                        templateFile
                          ? 'border-success bg-success/5 text-success'
                          : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary hover:bg-primary/5'
                      }`}>
                      {templateLoading ? (
                        <><Icon name="progress_activity" className="animate-spin text-[22px]" /><span className="text-caption">분석 중…</span></>
                      ) : templateFile ? (
                        <><Icon name="check_circle" className="text-[22px]" /><span className="text-caption font-medium">{templateFile.name}</span><span className="text-[10px]">클릭하여 다른 파일 선택</span></>
                      ) : (
                        <><Icon name="upload_file" className="text-[22px]" /><span className="text-caption font-medium">클릭하여 .docx 파일 업로드</span><span className="text-[10px]">.doc / .docx 지원</span></>
                      )}
                    </button>
                  </div>
                  {templateStructure && (
                    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 max-h-[100px] overflow-y-auto custom-scrollbar">
                      <p className="text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">문서 구조 분석</p>
                      <p className="text-[11px] text-on-surface whitespace-pre-wrap leading-relaxed">
                        {templateStructure.rawText.slice(0, 500)}{templateStructure.rawText.length > 500 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      작성할 내용 지시 <span className="text-error">*</span>
                    </label>
                    <textarea value={templateContent} onChange={(e) => setTemplateContent(e.target.value)} rows={3}
                      placeholder={templateStructure ? '예: 위 형식으로 "2025년 사업 계획" 내용을 채워주세요.' : '템플릿 파일을 먼저 업로드해 주세요.'}
                      disabled={!templateStructure}
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50" />
                  </div>
                </div>
              )}

              {/* ─ PDF 분석 폼 ─ */}
              {mode === 'pdf' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      PDF 파일 업로드 <span className="text-error">*</span>
                    </label>
                    <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePdfUpload(f) }} />
                    <button type="button" onClick={() => pdfInputRef.current?.click()}
                      className={`w-full h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                        pdfFile
                          ? 'border-error bg-error/5 text-error'
                          : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-error/50 hover:text-error hover:bg-error/5'
                      }`}>
                      {pdfLoading ? (
                        <><Icon name="progress_activity" className="animate-spin text-[22px]" /><span className="text-caption">텍스트 추출 중…</span></>
                      ) : pdfFile ? (
                        <>
                          <Icon name="picture_as_pdf" className="text-[22px]" />
                          <span className="text-caption font-medium">{pdfFile.name}</span>
                          {pdfResult && <span className="text-[10px]">{pdfResult.pageCount}페이지 · {Math.round(pdfResult.text.length / 100) / 10}KB 텍스트 추출됨</span>}
                        </>
                      ) : (
                        <><Icon name="upload_file" className="text-[22px]" /><span className="text-caption font-medium">클릭하여 PDF 업로드</span><span className="text-[10px]">.pdf 지원 (텍스트 기반 PDF 권장)</span></>
                      )}
                    </button>
                  </div>
                  {pdfResult && (
                    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 max-h-[100px] overflow-y-auto custom-scrollbar">
                      <p className="text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">추출된 텍스트 미리보기</p>
                      <p className="text-[11px] text-on-surface whitespace-pre-wrap leading-relaxed">
                        {pdfResult.text.slice(0, 600)}{pdfResult.text.length > 600 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      AI 지시사항 <span className="text-error">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {['요약해줘', '핵심 내용 정리', '보고서 형식으로 정리', '번역해줘 (영→한)', '분석 및 인사이트 제공', '목차와 구조 분석'].map((t) => (
                        <button key={t} type="button" onClick={() => setPdfInstruction(t)}
                          className={`h-7 px-2.5 rounded-full text-caption border transition-colors ${
                            pdfInstruction === t ? 'bg-error text-white border-error' : 'border-outline-variant text-on-surface-variant hover:border-error/50 hover:text-error'
                          }`}>{t}</button>
                      ))}
                    </div>
                    <textarea value={pdfInstruction} onChange={(e) => setPdfInstruction(e.target.value)} rows={2}
                      placeholder="예: 핵심 내용을 3가지로 요약하고 결론을 도출해줘"
                      disabled={!pdfResult}
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50" />
                  </div>
                </div>
              )}

              {/* ─ 이미지 분석 폼 ─ */}
              {mode === 'image' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      이미지 파일 업로드 <span className="text-error">*</span>
                    </label>
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }} />
                    <button type="button" onClick={() => imageInputRef.current?.click()}
                      className={`w-full h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors overflow-hidden relative ${
                        imageDataUrl ? 'border-emerald-400 bg-emerald-50' : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-emerald-400/50 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}>
                      {imageDataUrl ? (
                        <>
                          <img src={imageDataUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                          <div className="relative flex flex-col items-center gap-0.5">
                            <Icon name="check_circle" className="text-[22px] text-emerald-600" />
                            <span className="text-caption font-medium text-emerald-700">{imageFile?.name}</span>
                            <span className="text-[10px] text-emerald-600">클릭하여 다른 파일 선택</span>
                          </div>
                        </>
                      ) : (
                        <><Icon name="add_photo_alternate" className="text-[24px]" /><span className="text-caption font-medium">클릭하여 이미지 업로드</span><span className="text-[10px]">JPG / PNG / GIF / WebP 지원</span></>
                      )}
                    </button>
                  </div>
                  {imageDataUrl && (
                    <div className="rounded-lg overflow-hidden border border-outline-variant max-h-[180px]">
                      <img src={imageDataUrl} alt="uploaded" className="w-full object-contain max-h-[180px]" />
                    </div>
                  )}
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">
                      AI 지시사항 <span className="text-error">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {['이미지를 설명해줘', '텍스트 추출 (OCR)', '차트/그래프 분석', '문서 내용 정리', '표 데이터 추출', '이미지 속 문제 해결'].map((t) => (
                        <button key={t} type="button" onClick={() => setImageInstruction(t)}
                          className={`h-7 px-2.5 rounded-full text-caption border transition-colors ${
                            imageInstruction === t ? 'bg-emerald-600 text-white border-emerald-600' : 'border-outline-variant text-on-surface-variant hover:border-emerald-500/50 hover:text-emerald-700'
                          }`}>{t}</button>
                      ))}
                    </div>
                    <textarea value={imageInstruction} onChange={(e) => setImageInstruction(e.target.value)} rows={2}
                      placeholder="예: 이 차트의 데이터를 표로 정리하고 트렌드를 분석해줘"
                      disabled={!imageDataUrl}
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50" />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-caption text-error flex items-center gap-1">
                  <Icon name="error" className="text-[14px]" />
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 푸터 — 입력 단계에서만 */}
        {step === 'input' && (
          <div className="px-5 py-3 border-t border-outline-variant flex items-center justify-between gap-3 shrink-0">
            <div className="space-y-0.5">
              <p className="text-[11px] text-on-surface-variant/70">활성화된 모델로 문서를 생성합니다. 1턴이 소비됩니다.</p>
              {/* 출력 형식 선택 */}
              <div className="flex gap-1">
                {OUTPUT_FORMATS.map((fmt) => (
                  <button key={fmt.id} type="button" onClick={() => setOutputFormat(fmt.id)}
                    className={`inline-flex h-6 items-center gap-0.5 rounded border px-2 text-[11px] font-medium transition-colors ${
                      outputFormat === fmt.id ? fmt.color : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                    }`}>
                    <Icon name={fmt.icon} className="text-[12px]" />
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={onClose}
                className="h-9 rounded-lg border border-outline-variant px-4 text-label text-on-surface-variant hover:bg-surface-container-high">
                취소
              </button>
              <button type="button" onClick={() => void handleGenerate()}
                disabled={
                  (mode === 'blank'    && !topic.trim()) ||
                  (mode === 'template' && (!templateStructure || !templateContent.trim())) ||
                  (mode === 'pdf'      && (!pdfResult || !pdfInstruction.trim())) ||
                  (mode === 'image'    && (!imageDataUrl || !imageInstruction.trim()))
                }
                className="h-9 rounded-lg bg-primary px-5 text-label text-on-primary hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                <Icon name="auto_awesome" className="text-[16px]" />
                AI 생성
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
