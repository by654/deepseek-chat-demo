import { createId } from '../utils/id.js'
import { getVisibleMessages } from './chat/branches.js'
import { applyRemoteSession } from './chat/store.js'
import type { Message, Session } from './chat/types.js'
import { log } from './logs.js'
import { supabase } from './supabase/client.js'

/** 分享内容版本；字段变化时递增，旧版本导入时按缺省值兼容 */
const SHARE_VERSION = 1

/** 单条分享消息：只保留正文与附件元数据，不含思考过程、工具结果与附件原件 */
export type ShareMessage =
  | {
      role: 'user'
      text: string
      createdAt: number
      files: { name: string; size: number; isImage: boolean; note?: string }[]
    }
  | {
      role: 'assistant'
      text: string
      createdAt: number
      model: string | null
    }

export type SharePayload = {
  version: number
  title: string
  createdAt: number
  messages: ShareMessage[]
}

/** 云端分享记录（列表用） */
export type MyShare = {
  id: string
  sessionId: string
  title: string
  views: number
  hasPassword: boolean
  expiresAt: string | null
  revoked: boolean
  createdAt: string
}

/** 读取到的分享内容 */
export type LoadedShare = {
  id: string
  title: string
  payload: SharePayload
  createdAt: string
  expiresAt: string | null
  hasPassword: boolean
}

export type ShareFailure = 'login' | 'tooLarge' | 'failed' | 'password' | 'missing'

const MAX_PAYLOAD_BYTES = 3_500_000

const asText = (value: unknown) => (typeof value === 'string' ? value : '')

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** 助手正文：只拼文本块，跳过服务端模板提示 */
const assistantText = (message: Extract<Message, { role: 'assistant' }>) =>
  message.blocks
    .flatMap((block) => (block.type === 'text' && !block.isTemplate ? [block.text] : []))
    .join('')

export const buildSharePayload = (session: Session): SharePayload => ({
  version: SHARE_VERSION,
  title: session.title || '未命名会话',
  createdAt: session.createdAt,
  messages: getVisibleMessages(session)
    .map((message): ShareMessage | null => {
      if (message.role === 'user') {
        const text = message.content.trim()
        if (text === '' && message.files.length === 0) {
          return null
        }
        return {
          role: 'user',
          text,
          createdAt: message.createdAt,
          files: message.files.map((file) => ({
            name: file.name,
            size: file.size,
            isImage: file.isImage,
            ...(file.note ? { note: file.note } : {}),
          })),
        }
      }
      const text = assistantText(message).trim()
      return text === ''
        ? null
        : { role: 'assistant', text, createdAt: message.createdAt, model: message.model }
    })
    .filter((message): message is ShareMessage => message !== null),
})

/** SHA-256（hex）：密码只以摘要形式离开浏览器 */
export const hashSharePassword = async (password: string): Promise<string> => {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 分享链接：保留当前部署路径，只替换查询参数 */
export const shareUrl = (id: string) => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('share', id)
  return url.toString()
}

export const createShare = async (
  session: Session,
  options: { password: string; expiresAt: string | null }
): Promise<{ ok: true; id: string } | { ok: false; reason: ShareFailure }> => {
  const payload = buildSharePayload(session)
  if (payload.messages.length === 0) {
    return { ok: false, reason: 'failed' }
  }
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: 'tooLarge' }
  }
  const id = createId().replace(/-/g, '').slice(0, 20)
  const password = options.password.trim()
  try {
    const { error } = await supabase.rpc('create_chat_share', {
      p_id: id,
      p_session_id: session.id,
      p_title: payload.title,
      p_data: payload,
      p_password_hash: password === '' ? null : await hashSharePassword(password),
      p_expires_at: options.expiresAt,
    })
    if (error) {
      log('error', 'createShare', { code: error.code, message: error.message })
      return { ok: false, reason: error.code === '28000' ? 'login' : 'failed' }
    }
    return { ok: true, id }
  } catch (error) {
    log('error', 'createShare', { message: error instanceof Error ? error.message : String(error) })
    return { ok: false, reason: 'failed' }
  }
}

/** 匿名可读：密码用 SHA-256 摘要比对，服务端不接触明文 */
export const loadShare = async (
  id: string,
  password = ''
): Promise<{ ok: true; share: LoadedShare } | { ok: false; reason: ShareFailure }> => {
  try {
    const { data, error } = await supabase.rpc('get_chat_share', {
      p_id: id,
      p_password_hash: password === '' ? null : await hashSharePassword(password),
    })
    if (error) {
      if (error.code === '42501') {
        return { ok: false, reason: 'password' }
      }
      return { ok: false, reason: 'missing' }
    }
    const row = asRecord(data)
    const payload = asRecord(row?.data) as unknown as SharePayload | null
    if (!row || !payload || !Array.isArray(payload.messages)) {
      return { ok: false, reason: 'missing' }
    }
    return {
      ok: true,
      share: {
        id: asText(row.id) || id,
        title: asText(row.title) || payload.title || '分享的会话',
        payload,
        createdAt: asText(row.created_at),
        expiresAt: asText(row.expires_at) || null,
        hasPassword: row.has_password === true,
      },
    }
  } catch (error) {
    log('error', 'loadShare', { message: error instanceof Error ? error.message : String(error) })
    return { ok: false, reason: 'failed' }
  }
}

export const listMyShares = async (): Promise<MyShare[]> => {
  const { data, error } = await supabase.rpc('list_my_shares')
  if (error || !Array.isArray(data)) {
    return []
  }
  return data
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((row) => ({
      id: asText(row.id),
      sessionId: asText(row.session_id),
      title: asText(row.title),
      views: Number(row.views) || 0,
      hasPassword: row.has_password === true,
      expiresAt: asText(row.expires_at) || null,
      revoked: row.revoked === true,
      createdAt: asText(row.created_at),
    }))
}

export const revokeShare = async (id: string): Promise<boolean> => {
  const { error } = await supabase.rpc('revoke_chat_share', { p_id: id })
  return !error
}

/**
 * 把分享内容导入为本地新会话。
 * 消息与附件 id 全部重新生成，避免与已有本地数据冲突；附件只有元数据，没有原件。
 */
export const importShare = async (share: LoadedShare): Promise<string> => {
  const now = Date.now()
  const messages: Message[] = share.payload.messages.map((item, index) => {
    const createdAt = Number(item.createdAt) || now + index
    if (item.role === 'user') {
      return {
        id: createId(),
        role: 'user',
        content: item.text,
        createdAt,
        files: (item.files ?? []).map((file) => ({
          id: createId(),
          serverId: null,
          name: file.name,
          size: Number(file.size) || 0,
          isImage: file.isImage === true,
          mimeType: '',
          ...(file.note ? { note: file.note } : {}),
        })),
      }
    }
    return {
      id: createId(),
      role: 'assistant',
      createdAt,
      model: null,
      prefix: false,
      status: 'done',
      blocks: [{ type: 'text', text: item.text }],
    }
  })
  const session: Session = {
    id: createId(),
    title: `${share.title}（分享）`,
    createdAt: now,
    updatedAt: now,
    messages,
    rootMessageId: messages.at(0)?.id ?? null,
  }
  await applyRemoteSession(session)
  return session.id
}
