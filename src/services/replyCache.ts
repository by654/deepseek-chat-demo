import type { MessageUsage } from './api/types.js'

/** 相同请求指纹的本地结果缓存，减少重复提问的费用；默认关闭，可在设置中开启。 */

const STORAGE_KEY = 'chat-demo:reply-cache'
const TTL = 7 * 86_400_000
const LIMIT = 60

type CacheEntry = {
  text: string
  usage?: MessageUsage
  model: string
  createdAt: number
}

type CacheMap = Record<string, CacheEntry>

const fnv = (text: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export const buildReplyCacheKey = (
  model: string,
  system: string,
  messages: unknown,
  thinking: boolean
) => fnv(JSON.stringify({ model, system, messages, thinking }))

const readAll = (): CacheMap => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as CacheMap) : {}
  } catch {
    return {}
  }
}

const writeAll = (map: CacheMap) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // 空间不足时静默放弃缓存
  }
}

export const readCachedReply = (key: string): CacheEntry | null => {
  const entry = readAll()[key]
  if (!entry || Date.now() - entry.createdAt > TTL) {
    return null
  }
  return entry
}

export const writeCachedReply = (key: string, text: string, usage?: MessageUsage) => {
  if (!text.trim()) {
    return
  }
  const map = readAll()
  map[key] = { text, usage, model: '', createdAt: Date.now() }
  const entries = Object.entries(map)
    .filter(([, entry]) => Date.now() - entry.createdAt <= TTL)
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
    .slice(0, LIMIT)
  writeAll(Object.fromEntries(entries))
}

export const clearReplyCache = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}

export const replyCacheSize = () => Object.keys(readAll()).length
