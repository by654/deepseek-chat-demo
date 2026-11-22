import type { Session } from '../chat/types.js'

/**
 * 稳定序列化：对象键按字典序排序、丢弃 undefined。
 * 云端 data 存在 jsonb 列，Postgres 回读时对象键顺序会被重排，
 * 因此不能用 JSON.stringify 直接算指纹，否则本地对象与云端回读结果永远不等。
 */
const canonical = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}

/** cyrb53 变体：两个 32 位累加器拼成 16 位十六进制，碰撞概率足够低且无依赖 */
const hash = (input: string): string => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * 会话内容指纹：id + title + rootMessageId + messages 的稳定序列化哈希。
 * 刻意不包含 updatedAt：时间戳只用于排序和冲突裁决，是否「内容变了」只能看内容本身，
 * 否则「助手回答已写入但 updatedAt 没变」的会话会被误判成已同步。
 */
export const sessionFingerprint = (session: Session): string =>
  hash(
    canonical({
      id: session.id,
      title: session.title,
      rootMessageId: session.rootMessageId ?? null,
      messages: session.messages,
    })
  )

/**
 * 判断会话相对「最后一次成功推送的指纹」是否已经没有变化。
 * 内容指纹是唯一权威：即使 updatedAt 与指纹记录一致，也要算一次内容指纹再下结论，
 * 时间戳只作为记录字段随指纹一起保存，不参与短路。
 */
export const isSessionUnchanged = (
  entry: { u: number; f: string } | undefined,
  session: Session
): boolean => (entry ? entry.f === sessionFingerprint(session) : false)
