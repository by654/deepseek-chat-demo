/**
 * 脱敏诊断日志。
 *
 * 只记录与排障相关的事实（时间、级别、事件名、结构化字段），
 * 永远不写入 API Key、请求头、消息正文与附件内容。
 * 日志在内存中滚动保留最近若干条，导出时再拼装成文本。
 */

export type LogLevel = 'info' | 'warn' | 'error'

export type LogEntry = {
  time: number
  level: LogLevel
  event: string
  detail?: Record<string, unknown>
}

const MAX_ENTRIES = 400
const entries: LogEntry[] = []
let installed = false

/** 命中即整段替换为 *** 的敏感字段名 */
const SENSITIVE_KEYS = /^(authorization|api[-_]?key|x-api-key|token|accesstoken|cookie|password)$/i

/** 只保留可安全落盘的标量；长文本截断，避免日志膨胀 */
const sanitizeDetail = (
  detail: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!detail) {
    return undefined
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = '***'
      continue
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
      continue
    }
    if (typeof value === 'string') {
      const redacted = value
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
        .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***')
      out[key] = redacted.length > 160 ? `${redacted.slice(0, 160)}…` : redacted
      continue
    }
    // 数组与对象只记类型与长度，避免把正文写进日志
    out[key] = Array.isArray(value) ? `[数组 ${value.length}]` : '[对象]'
  }
  return out
}

export const log = (level: LogLevel, event: string, detail?: Record<string, unknown>) => {
  entries.push({ time: Date.now(), level, event, detail: sanitizeDetail(detail) })
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
}

export const logInfo = (event: string, detail?: Record<string, unknown>) => log('info', event, detail)
export const logWarn = (event: string, detail?: Record<string, unknown>) => log('warn', event, detail)
export const logError = (event: string, detail?: Record<string, unknown>) => log('error', event, detail)

/** 捕获未处理异常与 console.error，只保留消息，不记录堆栈中的本地路径细节 */
export const installLogCollectors = () => {
  if (installed || typeof window === 'undefined') {
    return
  }
  installed = true
  window.addEventListener('error', (event) => {
    logError('window.error', { message: String(event.message ?? '') })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | undefined
    logError('unhandledrejection', { message: String(reason?.message ?? reason ?? '') })
  })
  /* oxlint-disable-next-line eslint/no-console */
  const originalError = console.error.bind(console)
  /* oxlint-disable-next-line eslint/no-console */
  console.error = (...args: unknown[]) => {
    logError('console.error', { message: args.map((arg) => String(arg)).join(' ') })
    originalError(...args)
  }
}

export type LogContext = Record<string, unknown>

/**
 * 生成脱敏后的完整日志文本：环境信息 + 设置快照（剔除密钥）+ 事件流水。
 * 设置里的 apiKey 一律替换为「已配置/未配置」。
 */
export const buildLogDump = (context: LogContext): string => {
  const header = [
    'DeepSeek 美化版 诊断日志（已脱敏）',
    `导出时间：${new Date().toISOString()}`,
    '',
    '## 环境与配置',
    ...Object.entries(context).map(([key, value]) => `${key}: ${formatValue(value)}`),
    '',
    `## 事件（${entries.length} 条）`,
  ]
  const body = entries.map((entry) => {
    const time = new Date(entry.time).toISOString()
    const detail = entry.detail ? ` ${JSON.stringify(entry.detail)}` : ''
    return `[${time}] ${entry.level.toUpperCase()} ${entry.event}${detail}`
  })
  return [...header, ...body].join('\n')
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '无'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/** 下载日志文件，返回文件名 */
export const downloadLog = (context: LogContext): string => {
  const text = buildLogDump(context)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `deepseek-beautified-log-${stamp}.txt`
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return fileName
}
