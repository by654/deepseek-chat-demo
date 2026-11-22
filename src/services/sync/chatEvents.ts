import type { Session } from '../chat/types.js'

/**
 * 会话本地变更通知。
 * chat store 只管本地持久化，云端推送由同步层注册的处理函数决定，
 * 两者通过这个极薄的钩子解耦，避免 store 直接依赖 Supabase。
 */
type ChatSyncHandlers = {
  saved?: (session: Session) => void
  deleted?: (sessionId: string) => void
}

let handlers: ChatSyncHandlers = {}

export const setChatSyncHandlers = (next: ChatSyncHandlers) => {
  handlers = next
}

export const notifySessionSaved = (session: Session) => {
  handlers.saved?.(session)
}

export const notifySessionDeleted = (sessionId: string) => {
  handlers.deleted?.(sessionId)
}
