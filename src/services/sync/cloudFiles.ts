import { create } from 'zustand'
import { useAccount } from '../account.js'
import * as db from '../chat/db.js'
import { useChatStore } from '../chat/store.js'
import type { Session } from '../chat/types.js'
import { log } from '../logs.js'
import { useSettings } from '../settings.js'
import { supabase } from '../supabase/client.js'

/** 与 supabase/features.sql 中的私有存储桶一致 */
const BUCKET = 'chat-attachments'
/** 与存储桶 file_size_limit 一致 */
const MAX_BYTES = 64 * 1024 * 1024
/** 云端目录清单缓存时长 */
const INDEX_TTL = 5 * 60_000
/** 单会话保存后等待多久再同步附件 */
const UPLOAD_DEBOUNCE_MS = 3_000

type CloudFileState = {
  uploading: boolean
  downloading: boolean
  /** 全量同步进度：done / total；null 表示没有进行全量同步 */
  progress: { done: number; total: number } | null
  uploaded: number
  downloaded: number
  error: 'quota' | 'missing' | 'failed' | null
  lastAt: number | null
}

export const useCloudFiles = create<CloudFileState>(() => ({
  uploading: false,
  downloading: false,
  progress: null,
  uploaded: 0,
  downloaded: 0,
  error: null,
  lastAt: null,
}))

const userOf = () => useAccount.getState().user?.id

/** 附件 id 可能来自导入数据，作为对象名时只保留安全字符 */
const safeName = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_')

const indexCache = new Map<string, { at: number; ids: Set<string> }>()

const ensureIndex = async (userId: string, force = false): Promise<Set<string>> => {
  const cached = indexCache.get(userId)
  if (!force && cached && Date.now() - cached.at < INDEX_TTL) {
    return cached.ids
  }
  const ids = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) {
      throw error
    }
    const page = data ?? []
    for (const item of page) {
      ids.add(item.name)
    }
    if (page.length < 1000) {
      break
    }
  }
  indexCache.set(userId, { at: Date.now(), ids })
  return ids
}

const isQuotaError = (message: string) => {
  const lower = message.toLowerCase()
  return (
    lower.includes('exceeded') ||
    lower.includes('quota') ||
    lower.includes('maximum allowed size') ||
    lower.includes('payload too large')
  )
}

/** 存储桶与策略未初始化时的错误 */
const isMissingBucket = (message: string) => {
  const lower = message.toLowerCase()
  return lower.includes('bucket not found') || lower.includes('bucket does not exist')
}

const reportFailure = (scope: string, error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  log('error', scope, { message })
  useCloudFiles.setState({
    error: isMissingBucket(message) ? 'missing' : isQuotaError(message) ? 'quota' : 'failed',
  })
}

/** 会话里出现过的全部附件 id（含历史分支），同一 id 只处理一次 */
const attachmentIds = (session: Session): string[] => [
  ...new Set(
    session.messages.flatMap((message) => (message.role === 'user' ? message.files.map((file) => file.id) : []))
  ),
]

const enabled = () => useSettings.getState().attachmentSync

/** 上传本地有原件、云端没有的附件；返回上传数量 */
export const uploadSessionAttachments = async (session: Session): Promise<number> => {
  const userId = userOf()
  if (!userId || !enabled()) {
    return 0
  }
  const ids = attachmentIds(session)
  if (ids.length === 0) {
    return 0
  }
  let uploaded = 0
  try {
    const index = await ensureIndex(userId)
    useCloudFiles.setState({ uploading: true, error: null })
    for (const id of ids) {
      const name = safeName(id)
      if (index.has(name)) {
        continue
      }
      const blob = await db.loadFile(id)
      if (!blob || blob.size === 0 || blob.size > MAX_BYTES) {
        continue
      }
      const { error } = await supabase.storage.from(BUCKET).upload(`${userId}/${name}`, blob, {
        upsert: true,
        contentType: blob.type || 'application/octet-stream',
      })
      if (error) {
        reportFailure('uploadAttachment', error)
        continue
      }
      index.add(name)
      uploaded += 1
    }
    if (uploaded > 0) {
      useCloudFiles.setState((state) => ({
        uploaded: state.uploaded + uploaded,
        lastAt: Date.now(),
      }))
    }
  } catch (error) {
    reportFailure('uploadAttachment', error)
  } finally {
    useCloudFiles.setState({ uploading: false })
  }
  return uploaded
}

/** 下载云端有、本地缺的附件；返回下载数量 */
export const downloadSessionAttachments = async (session: Session): Promise<number> => {
  const userId = userOf()
  if (!userId || !enabled()) {
    return 0
  }
  const ids = attachmentIds(session)
  if (ids.length === 0) {
    return 0
  }
  let downloaded = 0
  try {
    const index = await ensureIndex(userId)
    const missing = ids.filter((id) => index.has(safeName(id)))
    if (missing.length === 0) {
      return 0
    }
    useCloudFiles.setState({ downloading: true, error: null })
    for (const id of missing) {
      if (await db.loadFile(id)) {
        continue
      }
      const { data, error } = await supabase.storage.from(BUCKET).download(`${userId}/${safeName(id)}`)
      if (error || !data) {
        continue
      }
      await db.saveFiles([{ id, blob: data }])
      downloaded += 1
    }
    if (downloaded > 0) {
      useCloudFiles.setState((state) => ({
        downloaded: state.downloaded + downloaded,
        lastAt: Date.now(),
      }))
    }
  } catch (error) {
    reportFailure('downloadAttachment', error)
  } finally {
    useCloudFiles.setState({ downloading: false })
  }
  return downloaded
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** 会话保存后触发：同一会话的连续保存合并成一次附件同步 */
export const scheduleAttachmentSync = (session: Session) => {
  if (!userOf() || !enabled()) {
    return
  }
  const previous = timers.get(session.id)
  if (previous) {
    clearTimeout(previous)
  }
  timers.set(
    session.id,
    setTimeout(() => {
      timers.delete(session.id)
      void uploadSessionAttachments(session)
    }, UPLOAD_DEBOUNCE_MS)
  )
}

/** 手动全量同步：逐个会话上传本地附件并下载缺失原件 */
export const syncAllAttachments = async (): Promise<{ uploaded: number; downloaded: number }> => {
  const userId = userOf()
  if (!userId) {
    return { uploaded: 0, downloaded: 0 }
  }
  const summaries = useChatStore.getState().sessions
  const total = summaries.length
  let uploaded = 0
  let downloaded = 0
  useCloudFiles.setState({ progress: { done: 0, total }, error: null })
  try {
    let done = 0
    for (const summary of summaries) {
      const session = await db.loadSession(summary.id)
      if (session) {
        downloaded += await downloadSessionAttachments(session)
        uploaded += await uploadSessionAttachments(session)
      }
      done += 1
      useCloudFiles.setState({ progress: { done, total } })
    }
    useCloudFiles.setState({ lastAt: Date.now() })
  } finally {
    useCloudFiles.setState({ progress: null })
  }
  return { uploaded, downloaded }
}

/** 云端附件占用：文件名、大小与数量 */
export const cloudStorageUsage = async (): Promise<{ bytes: number; count: number }> => {
  const userId = userOf()
  if (!userId) {
    return { bytes: 0, count: 0 }
  }
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) {
      return { bytes: 0, count: 0 }
    }
    const items = data ?? []
    const bytes = items.reduce((sum, item) => {
      const size = (item.metadata as { size?: unknown } | null)?.size
      return sum + (typeof size === 'number' ? size : Number(size) || 0)
    }, 0)
    return { bytes, count: items.length }
  } catch {
    return { bytes: 0, count: 0 }
  }
}

/** 退出登录时清掉清单缓存，避免切换账号后串号 */
export const clearCloudFileCache = () => {
  indexCache.clear()
}
