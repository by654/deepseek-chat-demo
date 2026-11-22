/** 把 Markdown 中的 GFM 表格提取出来并下载为 CSV。 */

export type MarkdownTable = {
  headers: string[]
  rows: string[][]
}

const splitRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  let escaped = false
  for (const char of trimmed) {
    if (escaped) {
      cell += char
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  return cells
}

const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)

export const extractTables = (markdown: string): MarkdownTable[] => {
  const lines = markdown.split('\n')
  const tables: MarkdownTable[] = []
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (lines[i].includes('|') && isDivider(lines[i + 1])) {
      const headers = splitRow(lines[i])
      const rows: string[][] = []
      let cursor = i + 2
      while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) {
        const cells = splitRow(lines[cursor])
        if (cells.length > 0) {
          rows.push(headers.map((_, index) => cells[index] ?? ''))
        }
        cursor += 1
      }
      tables.push({ headers, rows })
      i = cursor - 1
    }
  }
  return tables
}

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""').replace(/<br\s*\/?>/gi, ' ')}"`

export const tableToCsv = (table: MarkdownTable): string =>
  [table.headers, ...table.rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')

export const downloadCsv = (table: MarkdownTable, name: string) => {
  // BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob([`\uFEFF${tableToCsv(table)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 取表格首行前几个单元格作为下载文件名。 */
export const tableName = (table: MarkdownTable, index: number) =>
  table.headers
    .slice(0, 2)
    .join('-')
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 40) || `表格-${index + 1}`
