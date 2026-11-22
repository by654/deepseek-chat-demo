import { getVisibleMessages } from '../chat/branches.js'
import type { AssistantMessage, Session } from '../chat/types.js'
import { redactText } from '../redact.js'

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

export const safeName = (title: string) =>
  (title || '未命名对话').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)

const replyText = (message: AssistantMessage) =>
  message.blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.text
      }
      if (block.type === 'thinking') {
        return `> 思考过程：${block.thinking.trim().replace(/\n/g, '\n> ')}`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')

const attachmentLines = (files: { name: string; note?: string }[]) =>
  files.map((file) => `- 附件：${file.name}${file.note ? `（${file.note}）` : ''}`)

const formatTime = (time: number) => new Date(time).toLocaleString('zh-CN')

const buildMarkdown = (session: Session, redact: boolean) => {
  const hide = (text: string) => (redact ? redactText(text) : text)
  const lines: string[] = [
    `# ${hide(session.title || '未命名对话')}`,
    '',
    `- 导出时间：${formatTime(Date.now())}`,
    `- 创建时间：${formatTime(session.createdAt)}`,
    `- 最后更新：${formatTime(session.updatedAt)}`,
    '',
    '---',
    '',
  ]
  for (const message of getVisibleMessages(session)) {
    if (message.role === 'user') {
      lines.push('## 我', '', hide(message.content).trim() || '（仅附件）', '')
      if (message.files.length > 0) {
        lines.push(...attachmentLines(message.files), '')
      }
    } else {
      const model = message.model ? ` · ${message.model}` : ''
      lines.push(`## DeepSeek${model}`, '')
      const body = hide(replyText(message)).trim()
      lines.push(body || '（无内容）', '')
      if (message.usage) {
        lines.push(
          `> 用量：输入 ${message.usage.input_tokens} · 输出 ${message.usage.output_tokens}`,
          ''
        )
      }
    }
    lines.push('---', '')
  }
  if (redact) {
    lines.push('> 本文件已自动脱敏：API Key、Bearer 凭证、邮箱、手机号与身份证号已打码。')
  }
  return lines.join('\n')
}

export const downloadSessionMarkdown = (session: Session, redact: boolean) => {
  const markdown = buildMarkdown(session, redact)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeName(session.title)}-${stamp()}.md`
  anchor.click()
  URL.revokeObjectURL(url)
  return anchor.download
}

/* ---------------- 打印 / PDF ---------------- */

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const inline = (text: string) =>
  escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    )

/** 轻量 Markdown → HTML，足够打印与另存 PDF；复杂语法按纯文本保留。 */
export const markdownToHtml = (markdown: string): string => {
  const lines = markdown.split('\n')
  const html: string[] = []
  let inCode = false
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) {
      html.push(`</${list}>`)
      list = null
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      closeList()
      if (inCode) {
        html.push('</code></pre>')
        inCode = false
      } else {
        html.push('<pre><code>')
        inCode = true
      }
      continue
    }
    if (inCode) {
      html.push(`${escapeHtml(line)}\n`)
      continue
    }
    if (!line.trim()) {
      closeList()
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]+$/.test(lines[i + 1])) {
      const cells = (row: string) =>
        row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
      const headers = cells(line)
      const rows: string[][] = []
      let cursor = i + 2
      while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) {
        rows.push(cells(lines[cursor]))
        cursor += 1
      }
      html.push(
        `<table><thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      )
      i = cursor - 1
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      closeList()
      const level = Math.min(6, heading[1].length)
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }
    if (line.startsWith('> ')) {
      closeList()
      html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
      continue
    }
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ordered) {
      if (list !== 'ol') {
        closeList()
        html.push('<ol>')
        list = 'ol'
      }
      html.push(`<li>${inline(ordered[1])}</li>`)
      continue
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      if (list !== 'ul') {
        closeList()
        html.push('<ul>')
        list = 'ul'
      }
      html.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    closeList()
    html.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  if (inCode) {
    html.push('</code></pre>')
  }
  return html.join('\n')
}

/** 生成单会话阅读页并在新窗口打开打印，可直接「另存为 PDF」。 */
export const printSession = (session: Session, redact: boolean) => {
  const hide = (text: string) => (redact ? redactText(text) : text)
  const blocks = getVisibleMessages(session)
    .map((message) => {
      if (message.role === 'user') {
        return `<section class="user"><div class="role">我</div>${markdownToHtml(
          hide(message.content)
        )}${message.files.length ? `<ul class="files">${attachmentLines(message.files)
          .map((line) => `<li>${escapeHtml(hide(line.slice(2)))}</li>`)
          .join('')}</ul>` : ''}</section>`
      }
      return `<section class="assistant"><div class="role">DeepSeek${
        message.model ? ` · ${escapeHtml(message.model)}` : ''
      }</div>${markdownToHtml(hide(replyText(message))) || '<p>（无内容）</p>'}</section>`
    })
    .join('')
  const title = escapeHtml(hide(session.title || '未命名对话'))
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1c1f23; max-width: 820px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  section { margin: 0 0 22px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; page-break-inside: avoid; }
  .role { font-size: 12px; font-weight: 700; color: #4d6bfe; margin-bottom: 6px; }
  .user { background: #f5f7ff; border-radius: 10px; padding: 12px 14px; }
  p { margin: 0 0 8px; white-space: pre-wrap; }
  pre { background: #f3f4f6; border-radius: 8px; padding: 12px; overflow: auto; font-size: 12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #eef1f5; border-radius: 4px; padding: 1px 4px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 3px solid #c7d2fe; color: #4b5563; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; }
  ul, ol { margin: 0 0 8px; padding-left: 22px; }
  .files { color: #6b7280; font-size: 12px; }
  .footer { color: #9ca3af; font-size: 11px; margin-top: 28px; text-align: center; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${title}</h1>
<div class="meta">创建：${formatTime(session.createdAt)} · 更新：${formatTime(session.updatedAt)} · 导出：${formatTime(
    Date.now()
  )}${redact ? ' · 已脱敏' : ''}</div>
${blocks}
<div class="footer">由 DeepSeek 美化版导出 · 内容由 AI 生成，请仔细甄别</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300))</script>
</body></html>`
  const win = window.open('', '_blank')
  if (!win) {
    return false
  }
  win.opener = null
  win.document.write(html)
  win.document.close()
  return true
}

export const sessionToText = (session: Session, redact: boolean) =>
  getVisibleMessages(session)
    .map((message) =>
      message.role === 'user'
        ? `我：${message.content}`
        : `DeepSeek：${replyText(message)}`
    )
    .join('\n\n')
    .replace(/^/, '')
    .replace(/.*/s, (text) => (redact ? redactText(text) : text))

/* ---------------- 长图 ---------------- */

type ImageLine = { text: string; font: string; color: string; gap: number }

const wrapLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
  color: string,
  gap = 0
): ImageLine[] => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let current = ''
    for (const char of paragraph) {
      const next = current + char
      ctx.font = font
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current)
        current = char
      } else {
        current = next
      }
    }
    if (current) {
      lines.push(current)
    }
  }
  return lines.map((line) => ({ text: line, font, color, gap }))
}

/** 把单会话渲染成一张竖向长图，便于在聊天工具里直接分享。 */
export const downloadSessionImage = (session: Session, redact: boolean): string => {
  const hide = (text: string) => (redact ? redactText(text) : text)
  const scale = window.devicePixelRatio > 1 ? 2 : 1
  const width = 900
  const padding = 52
  const maxWidth = width - padding * 2
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) {
    throw new Error('Canvas unavailable')
  }
  const titleFont = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif'
  const metaFont = '400 12px "PingFang SC", "Microsoft YaHei", sans-serif'
  const roleFont = '700 13px "PingFang SC", "Microsoft YaHei", sans-serif'
  const bodyFont = '400 15px "PingFang SC", "Microsoft YaHei", sans-serif'
  const monoFont = '400 13px ui-monospace, Consolas, monospace'
  const lines: ImageLine[] = [
    ...wrapLines(measure, hide(session.title || '未命名对话'), maxWidth, titleFont, '#111827', 8),
    ...wrapLines(
      measure,
      `创建 ${formatTime(session.createdAt)} · 更新 ${formatTime(session.updatedAt)}${redact ? ' · 已脱敏' : ''}`,
      maxWidth,
      metaFont,
      '#6b7280',
      24
    ),
  ]
  for (const message of getVisibleMessages(session)) {
    if (message.role === 'user') {
      lines.push(...wrapLines(measure, '我', maxWidth, roleFont, '#4d6bfe', 2))
      lines.push(...wrapLines(measure, hide(message.content) || '（仅附件）', maxWidth, bodyFont, '#111827', 2))
      for (const file of message.files) {
        lines.push(
          ...wrapLines(
            measure,
            `附件：${hide(file.name)}${file.note ? `（${hide(file.note)}）` : ''}`,
            maxWidth,
            metaFont,
            '#6b7280',
            0
          )
        )
      }
    } else {
      lines.push(...wrapLines(measure, `DeepSeek${message.model ? ` · ${message.model}` : ''}`, maxWidth, roleFont, '#12a594', 2))
      let inCode = false
      for (const raw of hide(replyText(message)).split('\n')) {
        if (raw.trim().startsWith('```')) {
          inCode = !inCode
          continue
        }
        lines.push(
          ...wrapLines(measure, raw || ' ', maxWidth, inCode ? monoFont : bodyFont, inCode ? '#374151' : '#1f2937', inCode ? 0 : 1)
        )
      }
    }
    lines.push({ text: '', font: bodyFont, color: '#e5e7eb', gap: 18 })
  }
  lines.push(...wrapLines(measure, '内容由 AI 生成，请仔细甄别 · DeepSeek 美化版', maxWidth, metaFont, '#9ca3af', 8))

  const lineHeight = 24
  // 浏览器画布高度上限约 32767px，按缩放倍数反推逻辑高度上限
  const totalHeight = Math.min(
    Math.floor(32000 / scale),
    padding * 2 +
      lines.reduce((sum, line) => sum + (line.text ? lineHeight : 10) + line.gap, 0)
  )
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = totalHeight * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas unavailable')
  }
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, totalHeight)
  let y = padding
  for (const line of lines) {
    if (y > totalHeight - padding) {
      break
    }
    if (line.text) {
      ctx.font = line.font
      ctx.fillStyle = line.color
      ctx.fillText(line.text, padding, y + 16)
      y += lineHeight
    } else {
      y += 10
    }
    y += line.gap
  }
  const name = `${safeName(session.title)}-${stamp()}.png`
  canvas.toBlob((blob) => {
    if (!blob) {
      return
    }
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
  return name
}
