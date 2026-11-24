import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const guideSource = path.join(root, 'developer-kit/APP_DEVELOPER_GUIDE.md')
const publicPage = path.join(root, 'public/developer-kit/guide/index.html')

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function safeHref(raw) {
  const target = raw.trim()
  if (/^(https?:\/\/|mailto:|#|\/)/i.test(target)) return target
  if (target === 'starter/' || target === 'starter') return '/user/downloads/ebs-ai-hub-app-developer-kit-v1.0.0.zip'
  if (target.endsWith('IMPORT_PROGRAM_PIPELINE.md')) return '#guide-section-6'
  return '#'
}

function inlineMarkdown(value) {
  const codeTokens = []
  let text = escapeHtml(value).replace(/`([^`]+)`/g, (_match, code) => {
    const token = `@@CODE${codeTokens.length}@@`
    codeTokens.push(`<code>${code}</code>`)
    return token
  })
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => `<a href="${escapeHtml(safeHref(href))}">${label}</a>`)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return text.replace(/@@CODE(\d+)@@/g, (_match, index) => codeTokens[Number(index)] ?? '')
}

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

export function renderDeveloperGuide(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const output = []
  const headings = []
  let index = 0
  let headingIndex = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }

    const fence = line.match(/^\s*```([\w-]*)\s*$/)
    if (fence) {
      const language = fence[1]
      const code = []
      index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++])
      index++
      output.push(`<pre${language ? ` data-language="${escapeHtml(language)}"` : ''}><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const id = `guide-section-${headingIndex++}`
      const title = heading[2].replace(/`/g, '')
      const titleHtml = inlineMarkdown(heading[2])
      if (level === 2 && headings.length === 0) output.push('@@GUIDE_TOC@@')
      output.push(`<h${level} id="${id}">${titleHtml}</h${level}>`)
      if (level === 2) headings.push({ id, title })
      index++
      continue
    }

    if (line.trim().startsWith('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const header = cells(line)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(cells(lines[index++]))
      output.push(`<div class="table-scroll"><table><thead><tr>${header.map((cell) => `<th scope="col">${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${header.map((_cell, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }

    const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/)
    const unordered = line.match(/^\s*-\s+(.+)$/)
    if (ordered || unordered) {
      const isOrdered = Boolean(ordered)
      const items = []
      while (index < lines.length) {
        const item = isOrdered ? lines[index].match(/^\s*\d+\.\s+(.+)$/) : lines[index].match(/^\s*-\s+(.+)$/)
        if (!item) break
        items.push(`<li>${inlineMarkdown(item[1])}</li>`)
        index++
      }
      output.push(`<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`)
      continue
    }

    const paragraph = [line.trim()]
    index++
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s|^\s*```|^\s*\||^\s*\d+\.\s|^\s*-\s/.test(lines[index])) paragraph.push(lines[index++].trim())
    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
  }

  const toc = headings.map(({ id, title }) => `<li><a href="#${id}">${escapeHtml(title)}</a></li>`).join('')
  const tocHtml = `<nav class="toc" aria-label="문서 목차"><h2>이 가이드의 내용</h2><ol>${toc}</ol></nav>`
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="EBS AI Hub 호환 앱 개발, 패키징, 미리보기 및 심사 제출 방법">
  <title>EBS AI Hub 앱 개발 가이드</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Noto Sans KR", system-ui, sans-serif; color: #182230; background: #f3f6fb; font-size: 13.6px; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    .topbar { background: #fff; border-bottom: 1px solid #dce3ed; }
    .topbar-inner { max-width: 1040px; margin: 0 auto; padding: 16px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    a { color: #2458c6; text-underline-offset: 3px; }
    .brand { color: #25334a; font-weight: 700; text-decoration: none; }
    .top-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .button { display: inline-flex; align-items: center; min-height: 44px; border-radius: 9px; padding: 9px 15px; background: #2458c6; color: white; font-size: 12px; font-weight: 650; text-decoration: none; }
    .button.secondary { color: #214da8; background: #edf2ff; }
    main { max-width: 1040px; margin: 32px auto 64px; padding: 0 24px; }
    article { background: #fff; border: 1px solid #dce3ed; border-radius: 16px; padding: clamp(24px, 4vw, 52px); box-shadow: 0 10px 32px #16233a0a; }
    .eyebrow { margin: 0 0 10px; color: #2458c6; font-size: 11.2px; font-weight: 700; }
    h1 { margin: 0 0 18px; font-size: 2.1rem; line-height: 1.25; letter-spacing: -.025em; }
    h2 { margin: 2.4em 0 .7em; padding-bottom: .35em; border-bottom: 1px solid #e6ebf2; font-size: 1.55rem; line-height: 1.35; }
    h3 { margin: 1.8em 0 .55em; font-size: 1.2rem; line-height: 1.4; }
    p, li { font-size: 1rem; line-height: 1.8; }
    p { margin: .9em 0; }
    li { margin: .35em 0; padding-left: .2em; }
    ul, ol { padding-left: 1.6em; }
    strong { color: #17263c; }
    code { padding: .12em .38em; border: 1px solid #e4e9f0; border-radius: 5px; background: #f3f5f8; color: #263852; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .88em; overflow-wrap: anywhere; }
    pre { overflow: auto; margin: 1.2em 0; padding: 20px; border-radius: 10px; background: #172234; color: #f2f5f9; font: 11.2px/1.7 ui-monospace, SFMono-Regular, Consolas, monospace; tab-size: 2; }
    pre code { padding: 0; border: 0; background: transparent; color: inherit; font-size: inherit; white-space: pre; }
    .table-scroll { overflow-x: auto; margin: 1.1em 0 1.5em; }
    table { width: 100%; border-collapse: collapse; font-size: .94rem; line-height: 1.65; }
    th, td { min-width: 115px; padding: 12px 14px; border: 1px solid #dce3ed; text-align: left; vertical-align: top; }
    th { background: #f3f6fb; font-weight: 700; }
    .toc { margin: 26px 0 36px; padding: 20px 24px; border-radius: 12px; background: #f5f7fb; }
    .toc h2 { margin: 0 0 10px; padding: 0; border: 0; font-size: 1.05rem; }
    .toc ol { margin: 0; columns: 2; column-gap: 36px; }
    .toc li { break-inside: avoid; margin: .25em 0; font-size: .92rem; }
    @media (max-width: 640px) {
      :root { font-size: 12.8px; }
      .topbar-inner { padding: 12px 16px; }
      main { margin: 16px auto 36px; padding: 0 12px; }
      article { padding: 22px 18px; }
      h1 { font-size: 1.8rem; }
      .toc ol { columns: 1; }
      pre { padding: 15px; font-size: 10.4px; }
    }
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">
    <a class="brand" href="/user/">EBS AI Hub · 앱 개발자 가이드</a>
    <nav class="top-actions" aria-label="개발자 자료">
      <a class="button secondary" href="/user/marketplace">마켓플레이스</a>
      <a class="button" href="/user/downloads/ebs-ai-hub-app-developer-kit-v1.0.0.zip" download>개발자 킷 다운로드</a>
    </nav>
  </div></header>
  <main><article>
    <p class="eyebrow">외부 개발자 문서</p>
    ${output.join('\n').replace('@@GUIDE_TOC@@', tocHtml)}
  </article></main>
</body>
</html>`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const markdown = fs.readFileSync(guideSource, 'utf8')
  fs.mkdirSync(path.dirname(publicPage), { recursive: true })
  fs.writeFileSync(publicPage, renderDeveloperGuide(markdown), 'utf8')
  console.log(`Rendered ${path.relative(root, publicPage)}`)
}
