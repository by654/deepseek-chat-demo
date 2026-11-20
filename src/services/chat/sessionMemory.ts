/** 记住上次打开的会话与其中的阅读位置，供首页恢复弹窗引导。 */

const LAST_SESSION_KEY = 'chat-demo:last-session'
const POSITION_PREFIX = 'chat-demo:view-position:'

/** 内存缓存，避免滚动时频繁读 sessionStorage */
const positions = new Map<string, number>()

const safeGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 隐私模式或配额不足时静默降级为仅内存记录
  }
}

export const saveLastSession = (sessionId: string | null) => {
  if (sessionId === null) {
    return
  }
  safeSet(LAST_SESSION_KEY, sessionId)
}

export const readLastSession = (): string | null => safeGet(LAST_SESSION_KEY)

export const clearLastSession = () => {
  try {
    window.localStorage.removeItem(LAST_SESSION_KEY)
  } catch {
    // 忽略
  }
}

export const saveViewPosition = (sessionId: string, top: number) => {
  const rounded = Math.round(top)
  if (positions.get(sessionId) === rounded) {
    return
  }
  positions.set(sessionId, rounded)
  safeSet(POSITION_PREFIX + sessionId, String(rounded))
}

export const readViewPosition = (sessionId: string): number | null => {
  const cached = positions.get(sessionId)
  if (cached !== undefined) {
    return cached
  }
  const raw = safeGet(POSITION_PREFIX + sessionId)
  if (raw === null) {
    return null
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return null
  }
  positions.set(sessionId, value)
  return value
}

/** 只在由「恢复上次聊天」发起的打开中生效一次，普通打开会话仍滚到底部 */
let pendingRestore: string | null = null

export const requestRestorePosition = (sessionId: string) => {
  pendingRestore = sessionId
}

export const consumeRestorePosition = (sessionId: string): boolean => {
  if (pendingRestore === sessionId) {
    pendingRestore = null
    return true
  }
  return false
}
