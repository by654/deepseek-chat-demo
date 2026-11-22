import * as db from './chat/db.js'
import { getVisibleMessages } from './chat/branches.js'
import { useSettings } from './settings.js'
import type { ChatModel } from './api/types.js'
import type { Message, Session } from './chat/types.js'

/** 全量会话缓存：命令面板打开时刷新一次，避免每次输入都读库。 */
let cache: Session[] | null = null

export const refreshSearchIndex = async () => {
  cache = await db.loadAllSessions()
  return cache
}

export const invalidateSearchIndex = () => {
  cache = null
}

export type SearchRange = 'all' | '7d' | '30d' | 'year'

export type SearchFilters = {
  range: SearchRange
  model: 'all' | ChatModel
  hasFiles: boolean
}

export const DEFAULT_FILTERS: SearchFilters = { range: 'all', model: 'all', hasFiles: false }

export type MessageSearchHit = {
  sessionId: string
  sessionTitle: string
  messageId: string
  role: 'user' | 'assistant'
  snippet: string
  before: { role: 'user' | 'assistant'; text: string }[]
  after: { role: 'user' | 'assistant'; text: string }[]
  createdAt: number
  model: string | null
  archived: boolean
}

export type SearchResult = {
  sessions: {
    id: string
    title: string
    updatedAt: number
    archived: boolean
    matchedInTitle: boolean
  }[]
  messages: MessageSearchHit[]
}

const messageText = (message: Message): string =>
  message.role === 'user'
    ? message.content
    : message.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('\n')

const isInRange = (time: number, range: SearchRange) => {
  if (range === 'all') {
    return true
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 365
  return time >= Date.now() - days * 86_400_000
}

const makeSnippet = (text: string, query: string) => {
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) {
    return text.slice(0, 120)
  }
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + query.length + 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`
}

const contextOf = (messages: Message[], index: number, offset: number, delta: number) => {
  const items: { role: 'user' | 'assistant'; text: string }[] = []
  for (let i = index + offset; i >= 0 && i < messages.length; i += delta) {
    const text = messageText(messages[i]).trim()
    if (text) {
      items.push({ role: messages[i].role, text: text.slice(0, 220) })
    }
    if (items.length >= 2) {
      break
    }
  }
  return delta < 0 ? items.reverse() : items
}

const matchesFilter = (session: Session, message: Message, filters: SearchFilters) => {
  if (filters.model !== 'all' && message.role === 'assistant' && message.model !== filters.model) {
    return false
  }
  if (filters.hasFiles && !getVisibleMessages(session).some((item) => item.role === 'user' && item.files.length > 0)) {
    return false
  }
  return isInRange(message.createdAt || session.updatedAt, filters.range)
}

/** 标题 + 消息全文搜索；归档会话仍可命中，回收站不参与。 */
export const searchChats = async (
  query: string,
  filters: SearchFilters = DEFAULT_FILTERS
): Promise<SearchResult> => {
  const text = query.trim().toLowerCase()
  const hiddenUnlocked = useSettings.getState().hiddenUnlocked
  const sessions = (cache ?? (await refreshSearchIndex())).filter(
    (session) => session.deletedAt === undefined && (!session.hidden || hiddenUnlocked)
  )
  const result: SearchResult = { sessions: [], messages: [] }
  for (const session of sessions) {
    if (!isInRange(session.updatedAt, filters.range)) {
      continue
    }
    const title = session.title || '新对话'
    const matchedInTitle = text === '' ? true : title.toLowerCase().includes(text)
    if (matchedInTitle) {
      result.sessions.push({
        id: session.id,
        title,
        updatedAt: session.updatedAt,
        archived: session.archivedAt !== undefined,
        matchedInTitle: text !== '',
      })
    }
    if (!text) {
      continue
    }
    const messages = getVisibleMessages(session)
    messages.forEach((message, index) => {
      const content = messageText(message)
      if (!content.toLowerCase().includes(text) || !matchesFilter(session, message, filters)) {
        return
      }
      result.messages.push({
        sessionId: session.id,
        sessionTitle: title,
        messageId: message.id,
        role: message.role,
        snippet: makeSnippet(content, query.trim()),
        before: contextOf(messages, index, -1, -1),
        after: contextOf(messages, index, 1, 1),
        createdAt: message.createdAt,
        model: message.role === 'assistant' ? message.model : null,
        archived: session.archivedAt !== undefined,
      })
    })
  }
  result.sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  result.messages.sort((a, b) => b.createdAt - a.createdAt)
  return { sessions: result.sessions.slice(0, 12), messages: result.messages.slice(0, 60) }
}

/** 命中片段切分，供界面按关键词高亮。 */
export const splitHighlight = (text: string, query: string): { text: string; hit: boolean }[] => {
  const needle = query.trim()
  if (!needle) {
    return [{ text, hit: false }]
  }
  const lower = text.toLowerCase()
  const target = needle.toLowerCase()
  const parts: { text: string; hit: boolean }[] = []
  let cursor = 0
  for (;;) {
    const index = lower.indexOf(target, cursor)
    if (index < 0) {
      break
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), hit: false })
    }
    parts.push({ text: text.slice(index, index + needle.length), hit: true })
    cursor = index + needle.length
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), hit: false })
  }
  return parts
}
