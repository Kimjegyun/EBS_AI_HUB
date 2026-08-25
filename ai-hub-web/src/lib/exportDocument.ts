// AI 응답 내용을 Word(.docx) / PDF / 이미지(.png) / plain-text(.txt) 파일로 내보내는 유틸리티.
// docx 패키지를 사용하며 Markdown 기본 서식을 Word 스타일로 변환합니다.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx'
import { saveAs } from 'file-saver'

// ─────────────────────────────────────────────────────────────────────────────
// 키워드 기반 파일명 생성
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 텍스트에서 핵심 키워드 3~5개를 추출해 파일명 슬러그를 만듭니다.
 * 조사·접속사·불용어를 제거하고 남은 명사/동사 기반 단어를 선택합니다.
 */
export function extractKeywordsForFilename(text: string, maxWords = 4): string {
  // Markdown 기호 제거 후 첫 400자만 사용
  const clean = text
    .replace(/```[\s\S]*?```/g, '')  // 코드 블록 제거
    .replace(/`[^`]*`/g, '')         // 인라인 코드 제거
    .replace(/[#*_~>[\]]/g, ' ')   // Markdown 기호 제거
    .replace(/https?:\/\/\S+/g, '')  // URL 제거
    .slice(0, 400)

  // 한국어 불용어 목록
  const stopwords = new Set([
    '이', '가', '을', '를', '은', '는', '의', '에', '서', '로', '으로',
    '와', '과', '이나', '나', '도', '만', '까지', '에서', '부터', '까지',
    '그', '이것', '저것', '것', '수', '있', '없', '하다', '되다',
    '그리고', '그러나', '그래서', '하지만', '때문', '위해', '통해',
    '대한', '관한', '위한', '있는', '없는', '하는', '되는', '된',
    '입니다', '합니다', '있습니다', '됩니다', '했습니다', '해야',
    '이런', '저런', '어떤', '같은', '다른', '여러', '모든', '각',
    '및', '또는', '또한', '즉', '따라서', '결국', '우선', '먼저',
  ])

  // 단어 추출 (2글자 이상, 숫자 혼합 포함)
  const words = clean
    .split(/[\s,.!?;:()\n\r"']+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !stopwords.has(w))

  // 빈도 카운트
  const freq = new Map<string, number>()
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1)
  }

  // 빈도 내림차순 정렬 → 상위 maxWords개 선택
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([w]) => w)

  if (keywords.length === 0) return ''

  // 파일명 안전 변환: 한글/영숫자만 유지
  return keywords
    .join('_')
    .replace(/[^\w\uAC00-\uD7A3\u3131-\u318E]/g, '')
    .slice(0, 60)
}

/**
 * 메시지 배열에서 키워드를 추출해 파일명을 생성합니다.
 * - 첫 번째 user 질문 + 첫 번째 assistant 응답에서 키워드 추출
 */
export function makeConversationFilename(
  messages: Array<{ role: string; content: string }>,
  prefix = '대화',
): string {
  const userMsg = messages.find((m) => m.role === 'user')?.content ?? ''
  const aiMsg = messages.find((m) => m.role === 'assistant')?.content ?? ''
  const combined = userMsg.slice(0, 200) + ' ' + aiMsg.slice(0, 200)
  const keywords = extractKeywordsForFilename(combined, 4)
  const date = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace('.', '')
  return keywords ? `${prefix}_${keywords}_${date}` : `${prefix}_${date}`
}

/**
 * 단일 응답에서 파일명을 생성합니다.
 */
export function makeResponseFilename(content: string): string {
  // 첫 줄 헤딩이 있으면 우선 사용
  const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim()
  if (firstLine.length >= 4) {
    const safe = firstLine.replace(/[^\w\uAC00-\uD7A3\u3131-\u318E\s]/g, '').trim().slice(0, 40)
    if (safe.length >= 4) return safe
  }
  const keywords = extractKeywordsForFilename(content, 4)
  return keywords || 'AI_응답'
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF 텍스트 추출 (pdfjs-dist)
// ─────────────────────────────────────────────────────────────────────────────

export type PdfExtractResult = {
  text: string        // 전체 텍스트
  pageCount: number
  filename: string
}

/**
 * PDF 파일에서 텍스트를 추출합니다. (pdfjs-dist 사용)
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const pdfjsLib = await import('pdfjs-dist')
  // workerSrc를 CDN으로 설정 (번들 사이즈 절약)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(`[페이지 ${i}]\n${pageText}`)
  }

  return {
    text: pageTexts.join('\n\n'),
    pageCount: pdf.numPages,
    filename: file.name.replace(/\.pdf$/i, ''),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Word(.docx) 구조 추출 (mammoth)
// ─────────────────────────────────────────────────────────────────────────────

export type DocxStructure = {
  rawText: string
  htmlPreview: string
  filename: string
}

export async function extractDocxStructure(file: File): Promise<DocxStructure> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()

  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }),
  ])

  return {
    rawText: textResult.value,
    htmlPreview: htmlResult.value,
    filename: file.name.replace(/\.docx?$/i, ''),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown → docx 변환 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = []
  const pattern = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|`([^`]+)`/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      runs.push(new TextRun({ text: text.slice(last, match.index) }))
    }
    if (match[1]) {
      runs.push(new TextRun({ text: match[2], bold: true }))
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[4], italics: true }))
    } else if (match[5] !== undefined) {
      runs.push(new TextRun({ text: match[5], font: 'Courier New', size: 20 }))
    }
    last = match.index + match[0].length
  }

  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last) }))
  }
  if (runs.length === 0) runs.push(new TextRun({ text }))
  return runs
}

function lineToParagraph(line: string): Paragraph {
  const h1 = /^#\s+(.+)/.exec(line)
  const h2 = /^##\s+(.+)/.exec(line)
  const h3 = /^###\s+(.+)/.exec(line)
  const hr = /^---+$/.test(line.trim())
  const bullet = /^[-*]\s+(.+)/.exec(line)
  const numbered = /^\d+\.\s+(.+)/.exec(line)

  const base = { spacing: { after: 80 } } as const

  if (hr) {
    return new Paragraph({
      ...base,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } },
      children: [new TextRun({ text: '' })],
    })
  }
  if (h1) return new Paragraph({ ...base, heading: HeadingLevel.HEADING_1, children: parseInlineMarkdown(h1[1]) })
  if (h2) return new Paragraph({ ...base, heading: HeadingLevel.HEADING_2, children: parseInlineMarkdown(h2[1]) })
  if (h3) return new Paragraph({ ...base, heading: HeadingLevel.HEADING_3, children: parseInlineMarkdown(h3[1]) })
  if (bullet) {
    return new Paragraph({ ...base, bullet: { level: 0 }, children: parseInlineMarkdown(bullet[1]) })
  }
  if (numbered) {
    return new Paragraph({
      ...base,
      numbering: { reference: 'default-numbering', level: 0 },
      children: parseInlineMarkdown(numbered[1]),
    })
  }
  if (line.trim() === '') {
    return new Paragraph({ ...base, children: [new TextRun({ text: '' })] })
  }
  return new Paragraph({ ...base, alignment: AlignmentType.LEFT, children: parseInlineMarkdown(line) })
}

export function markdownToParagraphs(markdown: string): Paragraph[] {
  return markdown.split('\n').map(lineToParagraph)
}

function makeDocxStyles() {
  return {
    default: {
      document: {
        run: { font: '맑은 고딕', size: 22, color: '1F2328' },
        paragraph: { spacing: { line: 320 } },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 36, color: '1A56DB', font: '맑은 고딕' },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 28, color: '1E3A5F', font: '맑은 고딕' },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 24, color: '374151', font: '맑은 고딕' },
        paragraph: { spacing: { before: 160, after: 80 } },
      },
    ],
  }
}

function makeNumbering() {
  return {
    config: [
      {
        reference: 'default-numbering',
        levels: [
          {
            level: 0,
            format: 'decimal' as const,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 260 } } },
          },
        ],
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 API — Word(.docx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 단일 AI 응답을 Word 파일로 저장합니다.
 * filename이 없으면 응답 내용에서 키워드를 추출해 파일명을 자동 생성합니다.
 */
export async function exportToDocx(content: string, filename?: string): Promise<void> {
  const name = filename ?? makeResponseFilename(content)
  const paragraphs = markdownToParagraphs(content)

  const doc = new Document({
    numbering: makeNumbering(),
    styles: makeDocxStyles(),
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } } },
        children: paragraphs,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${name}.docx`)
}

export function exportToTxt(content: string, filename?: string): void {
  const name = filename ?? makeResponseFilename(content)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, `${name}.txt`)
}

/**
 * 대화 전체를 하나의 Word 문서로 내보냅니다.
 * title이 없으면 대화 내용에서 키워드를 추출합니다.
 */
export async function exportConversationToDocx(
  messages: Array<{ role: 'user' | 'assistant'; content: string; engine?: string; model?: string }>,
  title?: string,
): Promise<void> {
  const docTitle = title ?? makeConversationFilename(messages)

  const paragraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: docTitle, bold: true, font: '맑은 고딕' })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `생성일: ${new Date().toLocaleString('ko-KR')}`,
          color: '6B7280', size: 18, font: '맑은 고딕',
        }),
      ],
      spacing: { after: 400 },
    }),
  ]

  for (const msg of messages) {
    const label = msg.role === 'user' ? '👤 사용자' : `🤖 AI (${msg.engine ?? ''} ${msg.model ?? ''})`
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 20, color: msg.role === 'user' ? '1A56DB' : '065F46', font: '맑은 고딕' })],
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
      }),
      ...markdownToParagraphs(msg.content),
      new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 160 } }),
    )
  }

  const doc = new Document({
    numbering: makeNumbering(),
    styles: makeDocxStyles(),
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } } },
        children: paragraphs,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${docTitle}.docx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 API — PDF 내보내기 (jsPDF)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 텍스트 내용을 PDF 파일로 저장합니다.
 * Markdown 기호는 제거하고 헤딩/본문/목록을 PDF 스타일로 변환합니다.
 */
export async function exportToPdf(content: string, filename?: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const name = filename ?? makeResponseFilename(content)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const maxWidth = pageWidth - margin * 2
  let y = 25

  const addPage = () => {
    doc.addPage()
    y = 25
  }

  const checkY = (needed = 10) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) addPage()
  }

  // 제목 페이지 헤더
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`생성일: ${new Date().toLocaleString('ko-KR')}`, margin, 15)
  doc.setTextColor(0, 0, 0)

  const lines = content.split('\n')
  for (const line of lines) {
    const h1 = /^#\s+(.+)/.exec(line)
    const h2 = /^##\s+(.+)/.exec(line)
    const h3 = /^###\s+(.+)/.exec(line)
    const hr = /^---+$/.test(line.trim())
    const bullet = /^[-*]\s+(.+)/.exec(line)
    const numbered = /^\d+\.\s+(.+)/.exec(line)
    const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1')

    if (hr) {
      checkY(6)
      doc.setDrawColor(180, 180, 180)
      doc.line(margin, y, pageWidth - margin, y)
      y += 5
    } else if (h1) {
      checkY(14)
      doc.setFontSize(18)
      doc.setTextColor(26, 86, 219)
      doc.setFont('helvetica', 'bold')
      const wrapped = doc.splitTextToSize(h1[1], maxWidth) as string[]
      doc.text(wrapped, margin, y)
      y += wrapped.length * 9 + 4
      doc.setTextColor(0, 0, 0)
    } else if (h2) {
      checkY(12)
      doc.setFontSize(14)
      doc.setTextColor(30, 58, 95)
      doc.setFont('helvetica', 'bold')
      const wrapped = doc.splitTextToSize(h2[1], maxWidth) as string[]
      doc.text(wrapped, margin, y)
      y += wrapped.length * 7 + 3
      doc.setTextColor(0, 0, 0)
    } else if (h3) {
      checkY(10)
      doc.setFontSize(12)
      doc.setTextColor(55, 65, 81)
      doc.setFont('helvetica', 'bold')
      const wrapped = doc.splitTextToSize(h3[1], maxWidth) as string[]
      doc.text(wrapped, margin, y)
      y += wrapped.length * 6 + 2
      doc.setTextColor(0, 0, 0)
    } else if (bullet) {
      checkY(7)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const text = `• ${bullet[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')}`
      const wrapped = doc.splitTextToSize(text, maxWidth - 4) as string[]
      doc.text(wrapped, margin + 3, y)
      y += wrapped.length * 5.5 + 1
    } else if (numbered) {
      checkY(7)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const num = /^(\d+)\./.exec(line)?.[1] ?? ''
      const text = `${num}. ${numbered[1].replace(/\*\*(.+?)\*\*/g, '$1')}`
      const wrapped = doc.splitTextToSize(text, maxWidth - 4) as string[]
      doc.text(wrapped, margin + 3, y)
      y += wrapped.length * 5.5 + 1
    } else if (clean.trim() === '') {
      y += 3
    } else {
      checkY(7)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(31, 35, 40)
      const wrapped = doc.splitTextToSize(clean, maxWidth) as string[]
      doc.text(wrapped, margin, y)
      y += wrapped.length * 5.5 + 1
    }
  }

  doc.save(`${name}.pdf`)
}

/**
 * 대화 전체를 PDF 파일로 저장합니다.
 */
export async function exportConversationToPdf(
  messages: Array<{ role: 'user' | 'assistant'; content: string; engine?: string; model?: string }>,
  title?: string,
): Promise<void> {
  const docTitle = title ?? makeConversationFilename(messages)

  // 대화 내용을 하나의 Markdown 문자열로 합친 뒤 exportToPdf 재활용
  const combined = [
    `# ${docTitle}`,
    `생성일: ${new Date().toLocaleString('ko-KR')}`,
    '',
    ...messages.map((msg) => {
      const label = msg.role === 'user'
        ? `## 👤 사용자`
        : `## 🤖 AI (${msg.engine ?? ''} ${msg.model ?? ''})`
      return `${label}\n\n${msg.content}`
    }),
  ].join('\n\n---\n\n')

  await exportToPdf(combined, docTitle)
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 API — 이미지(.png) 내보내기 (html-to-image)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AI 응답 텍스트를 보기 좋게 렌더링한 PNG 이미지로 저장합니다.
 * DOM 엘리먼트를 숨겨진 div에 렌더링하고 html-to-image로 캡처합니다.
 */
export async function exportToImage(content: string, filename?: string): Promise<void> {
  const { toPng } = await import('html-to-image')
  const name = filename ?? makeResponseFilename(content)

  // 임시 렌더링 컨테이너 생성
  const container = document.createElement('div')
  container.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    'width:800px', 'background:#ffffff',
    'font-family:"맑은 고딕",Segoe UI,system-ui,sans-serif',
    'font-size:14px', 'line-height:1.7', 'color:#1f2328',
    'padding:40px 48px', 'box-sizing:border-box',
  ].join(';')

  // Markdown → HTML 변환 (간단 버전)
  const html = content
    .replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:700;color:#1a56db;margin:16px 0 8px">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin:14px 0 6px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;color:#374151;margin:10px 0 4px">$1</h3>')
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0">')
    .replace(/^[-*] (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:3px 0;list-style-type:decimal;padding-left:4px">$2</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px">$1</code>')
    .split('\n')
    .map((line) => {
      if (line.startsWith('<h') || line.startsWith('<hr') || line.startsWith('<li')) return line
      if (line.trim() === '') return '<br>'
      return `<p style="margin:4px 0">${line}</p>`
    })
    .join('\n')

  // 헤더 추가
  container.innerHTML = `
    <div style="border-bottom:2px solid #1a56db;padding-bottom:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:18px">🤖</span>
        <span style="font-size:16px;font-weight:700;color:#1a56db">EBS AI 허브</span>
      </div>
      <div style="font-size:11px;color:#9ca3af">${new Date().toLocaleString('ko-KR')}</div>
    </div>
    <div>${html}</div>
    <div style="border-top:1px solid #e5e7eb;margin-top:20px;padding-top:10px;font-size:10px;color:#9ca3af;text-align:right">
      EBS AI 허브 · AI 응답 내보내기
    </div>
  `

  document.body.appendChild(container)
  try {
    const dataUrl = await toPng(container, { quality: 0.95, pixelRatio: 2 })
    saveAs(dataUrl, `${name}.png`)
  } finally {
    document.body.removeChild(container)
  }
}
