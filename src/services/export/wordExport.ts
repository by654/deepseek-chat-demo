/**
 * 把回答正文导出为 Word 文档。
 *
 * 使用 OOXML（.docx）而非 HTML 伪装的 .doc：手写最小可用的 ZIP 包结构
 * （[Content_Types].xml、_rels/.rels、word/document.xml、word/styles.xml），
 * 由 fflate 打包，Word / WPS / Pages 均可直接打开，不引入额外运行时依赖。
 * 字体、字号、颜色全部来自设置项，与改造前的视觉保持一致。
 */

import { strToU8, zipSync } from 'fflate'

export type WordExportOptions = {
  /** 文档标题，用于文件名与首行标题 */
  title: string
  /** 主标题字号（磅） */
  fontSize: number
  /** 正文字体族；default 表示交给 Word 用默认微软雅黑 */
  fontFamily: string
  /** 正文颜色 #rrggbb */
  color: string
  /** 是否附带生成时间与模型说明 */
  withMeta: boolean
}

type FontPair = { ascii: string; eastAsia: string }

/** 设置里的字体族 → Word 的 ascii / eastAsia 字体名 */
const WORD_FONTS: Record<string, FontPair> = {
  default: { ascii: 'Microsoft YaHei', eastAsia: '微软雅黑' },
  yahei: { ascii: 'Microsoft YaHei', eastAsia: '微软雅黑' },
  simsun: { ascii: 'SimSun', eastAsia: '宋体' },
  simhei: { ascii: 'SimHei', eastAsia: '黑体' },
  kaiti: { ascii: 'KaiTi', eastAsia: '楷体' },
  times: { ascii: 'Times New Roman', eastAsia: '宋体' },
}

const CODE_FONT: FontPair = { ascii: 'Consolas', eastAsia: '宋体' }

/** 与旧实现一致的 CSS 字体栈，供 HTML 预览（buildWordHtml）继续使用 */
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

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

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

const normalizeColor = (value: string): string => {
  const raw = value.replace('#', '').trim()
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : '333333'
}

/* ---------------------------------- docx ---------------------------------- */

type InlineRun = {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: boolean
  color?: string
}

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:[^)]+\))/g

/** 把一行 Markdown 文本拆成带格式的 run 列表 */
const parseInline = (line: string): InlineRun[] => {
  const runs: InlineRun[] = []
  let cursor = 0
  for (const match of line.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) {
      runs.push({ text: line.slice(cursor, index) })
    }
    const token = match[0]
    if (token.startsWith('`')) {
      runs.push({ text: token.slice(1, -1), code: true })
    } else if (token.startsWith('**')) {
      runs.push({ text: token.slice(2, -2), bold: true })
    } else if (token.startsWith('[')) {
      const label = /\[([^\]]+)\]/.exec(token)
      runs.push({ text: label ? label[1] : token, link: true })
    } else {
      runs.push({ text: token.slice(1, -1), italic: true })
    }
    cursor = index + token.length
  }
  if (cursor < line.length) {
    runs.push({ text: line.slice(cursor) })
  }
  return runs.length > 0 ? runs : [{ text: '' }]
}

type RenderContext = {
  font: FontPair
  sizePt: number
  color: string
  codeSizePt: number
  metaSizePt: number
  /** 整段加粗（标题使用） */
  bold?: boolean
}

const runXml = (run: InlineRun, ctx: RenderContext, explicitColor?: string): string => {
  const font = run.code ? CODE_FONT : ctx.font
  const size = run.code ? ctx.codeSizePt : ctx.sizePt
  const half = Math.round(Math.max(2, size * 2))
  const color = explicitColor ?? (run.link ? '2F6B7A' : undefined)
  const props: string[] = [
    `<w:rFonts w:ascii="${font.ascii}" w:hAnsi="${font.ascii}" w:eastAsia="${font.eastAsia}" w:cs="${font.ascii}"/>`,
  ]
  if (run.bold || ctx.bold) {
    props.push('<w:b/><w:bCs/>')
  }
  if (run.italic) {
    props.push('<w:i/><w:iCs/>')
  }
  if (run.link) {
    props.push('<w:u w:val="single"/>')
  }
  if (color) {
    props.push(`<w:color w:val="${color}"/>`)
  }
  props.push(`<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`)
  const text = escapeXml(run.text).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">')
  return `<w:r><w:rPr>${props.join('')}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
}

const runsXml = (line: string, ctx: RenderContext, explicitColor?: string): string =>
  parseInline(line)
    .map((run) => runXml(run, ctx, explicitColor))
    .join('')

const paragraphXml = (inner: string, props = ''): string =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`

/** 段落通用属性：行距 1.75（420 twips，auto）、段后 8pt */
const baseSpacing = (afterPt = 8, beforePt = 0): string =>
  `<w:spacing w:before="${beforePt * 20}" w:after="${afterPt * 20}" w:line="420" w:lineRule="auto"/>`

/** 极简 Markdown → OOXML 段落序列 */
const markdownToOoxml = (markdown: string, ctx: RenderContext): string => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inCode = false
  let codeBuffer: string[] = []
  let orderedIndex = 0

  const flushCode = () => {
    if (codeBuffer.length === 0) {
      return
    }
    const run = runXml({ text: codeBuffer.join('\n'), code: true }, ctx)
    out.push(
      paragraphXml(
        run,
        `<w:shd w:val="clear" w:color="auto" w:fill="F5F7F8"/>${baseSpacing(8)}`
      )
    )
    codeBuffer = []
  }

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ')
    if (/^\s*```/.test(line)) {
      if (inCode) {
        flushCode()
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuffer.push(line)
      continue
    }
    if (line.trim() === '') {
      orderedIndex = 0
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      orderedIndex = 0
      const level = Math.min(6, heading[1].length)
      const bump = level === 1 ? 6 : level === 2 ? 3 : level === 3 ? 1 : 0
      const headingCtx: RenderContext = { ...ctx, sizePt: ctx.sizePt + bump, bold: true }
      out.push(
        paragraphXml(runsXml(heading[2], headingCtx), `${baseSpacing(8, 14)}<w:keepNext/>`)
      )
      continue
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      orderedIndex = 0
      out.push(
        paragraphXml(
          '',
          `${baseSpacing(10, 4)}<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="DFE6E9"/></w:pBdr>`
        )
      )
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      orderedIndex = 0
      out.push(
        paragraphXml(
          runsXml(line.replace(/^\s*>\s?/, ''), ctx, '4A5A60'),
          `${baseSpacing(8)}<w:ind w:left="360" w:right="200"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9D4D8"/></w:pBdr>`
        )
      )
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) {
        continue
      }
      orderedIndex = 0
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell, index, arr) => cell !== '' || index === arr.length - 1)
      out.push(
        paragraphXml(
          runsXml(cells.join(' ｜ '), ctx),
          `${baseSpacing(0, 2)}<w:ind w:left="240"/>`
        )
      )
      continue
    }
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      orderedIndex += 1
      out.push(
        paragraphXml(
          `${runXml({ text: `${orderedIndex}. ` }, ctx)}${runsXml(ordered[1], ctx)}`,
          `${baseSpacing(2)}<w:ind w:left="480" w:hanging="240"/>`
        )
      )
      continue
    }
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      orderedIndex = 0
      out.push(
        paragraphXml(
          `${runXml({ text: '• ' }, ctx)}${runsXml(unordered[1], ctx)}`,
          `${baseSpacing(2)}<w:ind w:left="480" w:hanging="240"/>`
        )
      )
      continue
    }
    orderedIndex = 0
    out.push(paragraphXml(runsXml(line, ctx), baseSpacing()))
  }
  if (inCode) {
    flushCode()
  }
  return out.join('')
}

const coreXml = (title: string): string => {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(
    title
  )}</dc:title><dc:creator>DeepSeek 美化版</dc:creator><cp:lastModifiedBy>DeepSeek 美化版</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`
}

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>DeepSeek 美化版</Application><AppVersion>1.0</AppVersion></Properties>`

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

const stylesXml = (font: FontPair, sizePt: number, color: string): string => {
  const half = Math.round(sizePt * 2)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font.ascii}" w:hAnsi="${font.ascii}" w:eastAsia="${font.eastAsia}" w:cs="${font.ascii}"/><w:color w:val="${color}"/><w:sz w:val="${half}"/><w:szCs w:val="${half}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="420" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="420" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="${font.ascii}" w:hAnsi="${font.ascii}" w:eastAsia="${font.eastAsia}" w:cs="${font.ascii}"/><w:color w:val="${color}"/><w:sz w:val="${half}"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="2F6B7A"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`
}

const documentXml = (markdown: string, options: WordExportOptions): string => {
  const font = WORD_FONTS[options.fontFamily] ?? WORD_FONTS.default
  const color = normalizeColor(options.color)
  const ctx: RenderContext = {
    font,
    sizePt: options.fontSize,
    color,
    codeSizePt: Math.max(8, options.fontSize - 1),
    metaSizePt: Math.max(8, options.fontSize - 2),
  }
  const titleCtx: RenderContext = { ...ctx, sizePt: options.fontSize + 6 }
  const blocks: string[] = [
    paragraphXml(
      runXml({ text: options.title, bold: true }, titleCtx),
      `${baseSpacing(10, 0)}`
    ),
  ]
  if (options.withMeta) {
    blocks.push(
      paragraphXml(
        runXml({ text: `导出自 DeepSeek 美化版 · ${new Date().toLocaleString('zh-CN')}` }, ctx, '7A8B90'),
        baseSpacing(14)
      )
    )
  }
  blocks.push(markdownToOoxml(markdown, ctx))

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${blocks.join(
    ''
  )}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1247" w:right="1134" w:bottom="1247" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

/** 生成 .docx 二进制内容 */
export const buildDocx = (markdown: string, options: WordExportOptions): Uint8Array => {
  const font = WORD_FONTS[options.fontFamily] ?? WORD_FONTS.default
  const color = normalizeColor(options.color)
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypesXml),
      '_rels/.rels': strToU8(rootRelsXml),
      'docProps/core.xml': strToU8(coreXml(options.title)),
      'docProps/app.xml': strToU8(appXml),
      'word/document.xml': strToU8(documentXml(markdown, options)),
      'word/styles.xml': strToU8(stylesXml(font, options.fontSize, color)),
      'word/_rels/document.xml.rels': strToU8(documentRelsXml),
    },
    { level: 6 }
  )
}

/** 预览用 HTML（设置页预览区仍复用原有渲染） */
export const buildWordHtml = (markdown: string, options: WordExportOptions): string => {
  const family = FONT_STACKS[options.fontFamily] ?? FONT_STACKS.default
  const meta = options.withMeta
    ? `<p class="meta">导出自 DeepSeek 美化版 · ${new Date().toLocaleString('zh-CN')}</p>`
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
  const data = buildDocx(markdown, options)
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const fileName = `${safeName(options.baseName ?? options.title)}.docx`
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return fileName
}
