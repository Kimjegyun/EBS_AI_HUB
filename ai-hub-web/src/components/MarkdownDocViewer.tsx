/**
 * MarkdownDocViewer
 * Markdown 텍스트를 Word 문서처럼 보이게 렌더링하는 컴포넌트.
 * 헤딩, 표, 목록, 코드블록, 인라인 서식, 수평선 등을 지원합니다.
 * 외부 라이브러리 없이 순수 React + 인라인 스타일로 구현합니다.
 */

type Token =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'hr' }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'blockquote'; text: string }
  | { type: 'p'; text: string }
  | { type: 'empty' }

/** Markdown을 Token 배열로 파싱 */
function tokenize(md: string): Token[] {
  const lines = md.split('\n')
  const tokens: Token[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── 코드 블록 ──────────────────────────────────────────────────────────
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      tokens.push({ type: 'code', lang, code: codeLines.join('\n') })
      i++
      continue
    }

    // ── 표 (table) ────────────────────────────────────────────────────────
    if (line.includes('|') && lines[i + 1]?.match(/^[\s|:-]+$/)) {
      const headers = line.split('|').map(c => c.trim()).filter(Boolean)
      i += 2 // 헤더 + 구분자 줄 건너뜀
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean))
        i++
      }
      tokens.push({ type: 'table', headers, rows })
      continue
    }

    // ── 수평선 ─────────────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      tokens.push({ type: 'hr' })
      i++
      continue
    }

    // ── 헤딩 ───────────────────────────────────────────────────────────────
    const h4 = /^####\s+(.+)/.exec(line)
    const h3 = /^###\s+(.+)/.exec(line)
    const h2 = /^##\s+(.+)/.exec(line)
    const h1 = /^#\s+(.+)/.exec(line)
    if (h4) { tokens.push({ type: 'h4', text: h4[1] }); i++; continue }
    if (h3) { tokens.push({ type: 'h3', text: h3[1] }); i++; continue }
    if (h2) { tokens.push({ type: 'h2', text: h2[1] }); i++; continue }
    if (h1) { tokens.push({ type: 'h1', text: h1[1] }); i++; continue }

    // ── 인용 ───────────────────────────────────────────────────────────────
    if (line.startsWith('>')) {
      tokens.push({ type: 'blockquote', text: line.slice(1).trim() })
      i++
      continue
    }

    // ── 비순서 목록 ────────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i++
      }
      tokens.push({ type: 'ul', items })
      continue
    }

    // ── 순서 목록 ─────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      tokens.push({ type: 'ol', items })
      continue
    }

    // ── 빈 줄 ─────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      tokens.push({ type: 'empty' })
      i++
      continue
    }

    // ── 문단 ──────────────────────────────────────────────────────────────
    tokens.push({ type: 'p', text: line })
    i++
  }

  return tokens
}

/** 인라인 Markdown을 React 요소로 변환 */
function parseInline(text: string, key: string | number): React.ReactNode {
  const parts: React.ReactNode[] = []
  // **bold**, *italic*, `code`, ~~strike~~
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|~~(.+?)~~)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))

    if (m[0].startsWith('**')) {
      parts.push(<strong key={`${key}-b-${m.index}`} style={{ fontWeight: 700 }}>{m[2]}</strong>)
    } else if (m[0].startsWith('*')) {
      parts.push(<em key={`${key}-i-${m.index}`}>{m[3]}</em>)
    } else if (m[0].startsWith('`')) {
      parts.push(
        <code key={`${key}-c-${m.index}`} style={{
          background: '#f3f4f6', border: '1px solid #e5e7eb',
          borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em',
        }}>{m[4]}</code>
      )
    } else if (m[0].startsWith('~~')) {
      parts.push(<s key={`${key}-s-${m.index}`}>{m[5]}</s>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? text : parts
}

// ── Word 스타일 상수 ─────────────────────────────────────────────────────────
const DOC_FONT = '"맑은 고딕", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif'
const H1_COLOR = '#1a56db'
const H2_COLOR = '#1e3a5f'
const H3_COLOR = '#374151'
const H4_COLOR = '#6b7280'
const TABLE_HEAD_BG = '#1e3a5f'
const TABLE_ROW_ALT = '#f0f4f8'
const CODE_BG = '#f8fafc'

// ── 렌더러 ───────────────────────────────────────────────────────────────────
export default function MarkdownDocViewer({
  content,
  className = '',
}: {
  content: string
  className?: string
}) {
  const tokens = tokenize(content)

  return (
    <div
      className={className}
      style={{ fontFamily: DOC_FONT, fontSize: 14, lineHeight: 1.75, color: '#1f2328' }}
    >
      {tokens.map((token, idx) => {
        switch (token.type) {

          case 'h1':
            return (
              <h1 key={idx} style={{
                fontSize: 22, fontWeight: 800, color: H1_COLOR,
                margin: '20px 0 10px', lineHeight: 1.3,
                paddingBottom: 6, borderBottom: `2.5px solid ${H1_COLOR}`,
              }}>
                {parseInline(token.text, idx)}
              </h1>
            )

          case 'h2':
            return (
              <h2 key={idx} style={{
                fontSize: 17, fontWeight: 700, color: H2_COLOR,
                margin: '18px 0 8px', lineHeight: 1.35,
              }}>
                {parseInline(token.text, idx)}
              </h2>
            )

          case 'h3':
            return (
              <h3 key={idx} style={{
                fontSize: 14, fontWeight: 700, color: H3_COLOR,
                margin: '14px 0 6px', lineHeight: 1.4,
              }}>
                {parseInline(token.text, idx)}
              </h3>
            )

          case 'h4':
            return (
              <h4 key={idx} style={{
                fontSize: 13, fontWeight: 600, color: H4_COLOR,
                margin: '10px 0 4px',
              }}>
                {parseInline(token.text, idx)}
              </h4>
            )

          case 'hr':
            return <hr key={idx} style={{ border: 'none', borderTop: '1.5px solid #e5e7eb', margin: '14px 0' }} />

          case 'table':
            return (
              <div key={idx} style={{ overflowX: 'auto', margin: '12px 0' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {token.headers.map((h, ci) => (
                        <th key={ci} style={{
                          background: TABLE_HEAD_BG, color: '#fff',
                          padding: '7px 12px', textAlign: 'left',
                          fontWeight: 600, whiteSpace: 'nowrap',
                          border: '1px solid #d1d5db',
                        }}>
                          {parseInline(h, `${idx}-th-${ci}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {token.rows.map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 1 ? TABLE_ROW_ALT : '#fff' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{
                            padding: '6px 12px', border: '1px solid #e5e7eb',
                            verticalAlign: 'top', lineHeight: 1.6,
                          }}>
                            {parseInline(cell, `${idx}-td-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

          case 'ul':
            return (
              <ul key={idx} style={{ margin: '6px 0', paddingLeft: 22, lineHeight: 1.8 }}>
                {token.items.map((item, li) => (
                  <li key={li} style={{ listStyleType: 'disc', marginBottom: 2 }}>
                    {parseInline(item, `${idx}-ul-${li}`)}
                  </li>
                ))}
              </ul>
            )

          case 'ol':
            return (
              <ol key={idx} style={{ margin: '6px 0', paddingLeft: 22, lineHeight: 1.8 }}>
                {token.items.map((item, li) => (
                  <li key={li} style={{ listStyleType: 'decimal', marginBottom: 2 }}>
                    {parseInline(item, `${idx}-ol-${li}`)}
                  </li>
                ))}
              </ol>
            )

          case 'code':
            return (
              <pre key={idx} style={{
                background: CODE_BG, border: '1px solid #e5e7eb', borderRadius: 6,
                padding: '10px 14px', margin: '8px 0', overflowX: 'auto',
                fontFamily: '"Courier New", monospace', fontSize: 12.5, lineHeight: 1.6,
                color: '#1f2328',
              }}>
                {token.lang && (
                  <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 4, fontFamily: DOC_FONT }}>
                    {token.lang}
                  </div>
                )}
                <code>{token.code}</code>
              </pre>
            )

          case 'blockquote':
            return (
              <blockquote key={idx} style={{
                borderLeft: `3px solid ${H1_COLOR}`, margin: '8px 0',
                paddingLeft: 14, color: '#374151', fontStyle: 'italic',
              }}>
                {parseInline(token.text, idx)}
              </blockquote>
            )

          case 'empty':
            return <div key={idx} style={{ height: 6 }} />

          case 'p':
          default:
            return (
              <p key={idx} style={{ margin: '4px 0', lineHeight: 1.75 }}>
                {parseInline(token.text, idx)}
              </p>
            )
        }
      })}
    </div>
  )
}
