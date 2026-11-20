import { useSyncExternalStore } from 'react'
import type { ChatModel } from '../api/types.js'

/** 新会话（尚未创建 ID）使用的选择位 */
const PENDING_KEY = 'chat-demo:pending-model'
/** 每个会话选择的模型，键为会话 ID */
const STORAGE_KEY = 'chat-demo:session-models'

export const DEFAULT_MODEL: ChatModel = 'deepseek-flash'

const isModel = (value: unknown): value is ChatModel =>
  value === 'deepseek-flash' || value === 'deepseek-v4-pro'

const readPending = (): ChatModel => {
  try {
    const saved = localStorage.getItem(PENDING_KEY)
    return isModel(saved) ? saved : DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

const readSessions = (): Record<string, ChatModel> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const models: Record<string, ChatModel> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isModel(value)) {
        models[key] = value
      }
    }
    return models
  } catch {
    return {}
  }
}

let pending = readPending()
let sessions = readSessions()
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

const persistSessions = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // 存储不可用时仅在内存中生效
  }
}

/** 会话模型：显式选择优先，未选择时回落到「新会话」选择位 */
export const getSessionModel = (sessionId: string | null): ChatModel => {
  if (sessionId === null) {
    return pending
  }
  return sessions[sessionId] ?? pending
}

/** 记录选择；会话 ID 为 null 时写入待生效选择位，供新建会话继承 */
export const setSessionModel = (sessionId: string | null, model: ChatModel) => {
  if (sessionId === null) {
    pending = model
    try {
      localStorage.setItem(PENDING_KEY, model)
    } catch {
      // 同上
    }
  } else {
    sessions = { ...sessions, [sessionId]: model }
    persistSessions()
  }
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 组件内读取当前会话选择的模型 */
export const useSessionModel = (sessionId: string | null): ChatModel =>
  useSyncExternalStore(
    subscribe,
    () => getSessionModel(sessionId),
    () => getSessionModel(sessionId)
  )
