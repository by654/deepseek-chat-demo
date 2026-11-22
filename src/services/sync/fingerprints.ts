/**
 * 已成功推送过的会话指纹缓存（按 userId 隔离，存 localStorage）。
 * 同时记录 updatedAt，用于「时间戳没变就直接判定未修改」的快路径，
 * 避免每次落盘都重新哈希整段消息。
 */
export type FingerprintEntry = {
  /** 计算指纹时的 session.updatedAt */
  u: number
  /** 内容指纹 */
  f: string
}

type FingerprintTable = Record<string, FingerprintEntry>

const KEY_PREFIX = 'chat-demo:sync-fingerprints:'

/** 内存镜像：localStorage 读写是同步的，但避免高频 JSON 解析 */
const memory = new Map<string, FingerprintTable>()

const storageKey = (userId: string) => `${KEY_PREFIX}${userId}`

const parse = (raw: string | null): FingerprintTable => {
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const table: FingerprintTable = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue
      }
      const entry = value as { u?: unknown; f?: unknown }
      if (typeof entry.f === 'string' && typeof entry.u === 'number') {
        table[id] = { u: entry.u, f: entry.f }
      }
    }
    return table
  } catch {
    return {}
  }
}

const tableOf = (userId: string): FingerprintTable => {
  const cached = memory.get(userId)
  if (cached) {
    return cached
  }
  let table: FingerprintTable = {}
  try {
    table = parse(localStorage.getItem(storageKey(userId)))
  } catch {
    table = {}
  }
  memory.set(userId, table)
  return table
}

const flush = (userId: string, table: FingerprintTable) => {
  memory.set(userId, table)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(table))
  } catch {
    // 隐私模式下写入失败时，本次会话内仍可用内存镜像去重
  }
}

/** 读取某账号的全部指纹（返回副本，调用方只在同步开始时取一次快照） */
export const readFingerprints = (userId: string): FingerprintTable => ({ ...tableOf(userId) })

export const readFingerprint = (userId: string, sessionId: string): FingerprintEntry | undefined =>
  tableOf(userId)[sessionId]

/** 推送成功后才写入；推送失败的会话不写，保证下次仍会重试 */
export const writeFingerprint = (
  userId: string,
  sessionId: string,
  fingerprint: string,
  updatedAt: number
) => {
  const table = tableOf(userId)
  const current = table[sessionId]
  if (current && current.f === fingerprint && current.u === updatedAt) {
    return
  }
  flush(userId, { ...table, [sessionId]: { u: updatedAt, f: fingerprint } })
}

export const dropFingerprint = (userId: string, sessionId: string) => {
  const table = tableOf(userId)
  if (!Object.hasOwn(table, sessionId)) {
    return
  }
  const next: FingerprintTable = Object.fromEntries(
    Object.entries(table).filter(([key]) => key !== sessionId)
  )
  flush(userId, next)
}

/** 退出登录 / 切换账号时清空该账号的指纹，避免串号 */
export const clearFingerprints = (userId: string) => {
  memory.delete(userId)
  try {
    localStorage.removeItem(storageKey(userId))
    localStorage.removeItem(`${VERSION_PREFIX}${userId}`)
  } catch {
    // 忽略：内存镜像已清空，本次会话不会再用到旧指纹
  }
}

/** 当前指纹算法版本；算法口径变化时递增 */
export const FINGERPRINT_VERSION = 'content-v2'

const VERSION_PREFIX = 'chat-demo:sync-fp-version:'

/**
 * 指纹算法升级后，历史登记是按旧口径算的，与新指纹不可比。
 * 此时不直接把全部会话判成「已改动」重传一遍，
 * 而是让拉取阶段按正文重新核验一次内容，一致就改写登记，不一致才上传。
 */
export const isFingerprintOutdated = (userId: string): boolean => {
  try {
    return localStorage.getItem(`${VERSION_PREFIX}${userId}`) !== FINGERPRINT_VERSION
  } catch {
    return true
  }
}

/** 一次完整拉取核验结束后才写版本，避免中途失败导致旧登记被当成新口径 */
export const markFingerprintVersion = (userId: string) => {
  try {
    localStorage.setItem(`${VERSION_PREFIX}${userId}`, FINGERPRINT_VERSION)
  } catch {
    // 忽略
  }
}

const LAST_SYNC_PREFIX = 'chat-demo:sync-last-at:'

export const readLastSyncAt = (userId: string): number | null => {
  try {
    const raw = localStorage.getItem(`${LAST_SYNC_PREFIX}${userId}`)
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export const writeLastSyncAt = (userId: string, at: number) => {
  try {
    localStorage.setItem(`${LAST_SYNC_PREFIX}${userId}`, String(at))
  } catch {
    // 忽略
  }
}
