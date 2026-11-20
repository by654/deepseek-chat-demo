/**
 * 把回答正文导出为 Word 文档。
 *
 * 不引入 docx 依赖：Word 能直接打开带 mso 样式的 HTML，用 .doc 扩展名与
 * application/msword 类型保存，兼容 Office 与 WPS，体积极小。
 */

export type WordExportOptions = {
  /** 文档标题，用于文件名与首行标题 */
  title: string
  /** 主标题字号（磅） */
  fontSize: number
  /** 正文字体族；default 表示交给 Word 用默认宋体/等线 */
  fontFamily: string
  /** 正文颜色 #rrggbb */
  color: string
  /** 是否附带生成时间与模型说明 */
  withMeta: boolean
}

const FONT_STACKS: Record<string, string> = {
  default: "'Microsoft YaHei','微软雅黑',SimSun,serif",
  yahei: "'Microsoft YaHei','微软雅黑',sans-serif",
  simsun: 'SimSun,宋体,serif',
  simhei: "SimHei,黑体,sans-serif",
  kaiti: 'KaiTi,楷体,serif',
  times: "'Times New Roman',serif",
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 行内格式：`code`、**粗体**、*斜体*、[文本](链接) */
const inline = (value: string): string => {
  let out = escapeHtml(value)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
  return out
}

/** 极简 Markdown → HTML：覆盖回答里常见的标题、列表、引用、代码块、分隔线 */
export const markdownToHtml = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inCode = false
  let codeBuffer: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
        codeBuffer = []
        inCode = false
      } else {
        closeList()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuffer.push(line)
      continue
    }
    if (line.trim() === '') {
      closeList()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      closeList()
      const level = Math.min(6, heading[1].length)
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeList()
      html.push('<hr/>')
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      closeList()
      html.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`)
      continue
    }
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${inline(ordered[1])}</li>`)
      continue
    }
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${inline(unordered[1])}</li>`)
      continue
    }
    closeList()
    html.push(`<p>${inline(line)}</p>`)
  }
  if (inCode && codeBuffer.length > 0) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
  }
  closeList()
  return html.join('\n')
}

const safeName = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '对话导出'

export const buildWordHtml = (markdown: string, options: WordExportOptions): string => {
  const family = FONT_STACKS[options.fontFamily] ?? FONT_STACKS.default
  const meta = options.withMeta
    ? `<p class="meta">导出自 DeepSeek Chat · ${new Date().toLocaleString('zh-CN')}</p>`
    : ''
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(options.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { margin: 2.2cm 2.0cm; }
body { font-family: ${family}; font-size: ${options.fontSize}pt; color: ${options.color}; line-height: 1.75; }
h1 { font-size: ${options.fontSize + 6}pt; }
h2 { font-size: ${options.fontSize + 3}pt; }
h3 { font-size: ${options.fontSize + 1}pt; }
h1,h2,h3,h4,h5,h6 { font-family: ${family}; color: ${options.color}; margin: 14pt 0 8pt; }
p { margin: 0 0 8pt; }
code, pre { font-family: Consolas,'Courier New',monospace; font-size: ${Math.max(8, options.fontSize - 1)}pt; }
pre { background: #f5f7f8; border: 1px solid #dfe6e9; padding: 8pt; white-space: pre-wrap; word-break: break-word; }
blockquote { margin: 8pt 0; padding-left: 10pt; border-left: 3pt solid #c9d4d8; color: #4a5a60; }
table { border-collapse: collapse; }
td, th { border: 1px solid #cfd8dc; padding: 4pt 6pt; }
hr { border: none; border-top: 1px solid #dfe6e9; }
.meta { font-size: ${Math.max(8, options.fontSize - 2)}pt; color: #7a8b90; }
</style>
</head>
<body>
<h1>${escapeHtml(options.title)}</h1>
${meta}
${markdownToHtml(markdown)}
</body>
</html>`
}

/** 触发浏览器下载；返回实际使用的文件名 */
export const downloadWord = (
  markdown: string,
  options: WordExportOptions & { baseName?: string }
): string => {
  const html = buildWordHtml(markdown, options)
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const fileName = `${safeName(options.baseName ?? options.title)}.doc`
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return fileName
}
