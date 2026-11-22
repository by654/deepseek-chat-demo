import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { createId } from '../../utils/id.js'
import { initAccount, useAccount } from '../account.js'
import * as db from '../chat/db.js'
import { applyRemoteSession, dropLocalSession, useChatStore } from '../chat/store.js'
import type { Message, Session } from '../chat/types.js'
import { supabase } from '../supabase/client.js'
import {
  CHAT_SESSIONS_TABLE,
  PUSH_BATCH_SIZE,
  PUSH_DEBOUNCE_MS,
  PUSH_RPC,
} from '../supabase/config.js'
import { setChatSyncHandlers } from './chatEvents.js'
import { clearCloudFileCache, scheduleAttachmentSync } from './cloudFiles.js'
import { isSessionUnchanged, sessionFingerprint } from './fingerprint.js'
import {
  clearFingerprints,
  dropFingerprint,
  isFingerprintOutdated,
  markFingerprintVersion,
  readFingerprints,
  readLastSyncAt,
  writeFingerprint,
  writeLastSyncAt,
} from './fingerprints.js'
import { showToast } from '../../components/base/toastState.js'

/** 设备标识：用来区分「别的设备写入」和「本设备写入的回声」 */
const DEVICE_KEY = 'chat-demo:sync-device'

const readDeviceId = () => {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) {
      return stored
    }
    const created = createId()
    localStorage.setItem(DEVICE_KEY, created)
    return created
  } catch {
    return createId()
  }
}

export const deviceId = readDeviceId()

/** 同步阶段：pull 先拉取合并，push 再推送本地较新或云端缺失的会话 */
export type SyncPhase = 'pull' | 'push'

/** 同步进度：done 已完成条数，total 当前阶段总条数；null 表示当前没有同步在进行 */
export type SyncProgress = { phase: SyncPhase; done: number; total: number }

/** 一次同步的汇总结果 */
/** pull / push 阶段抛出的错误摘要，用于 UI 提示与排查 */
export type SyncErrorInfo = {
  phase: SyncPhase
  code: string
  message: string
}

/** 一次同步的汇总结果；error 存在表示某个阶段失败（另一个阶段的成果仍然生效） */
export type SyncSummary = {
  downloaded: number
  uploaded: number
  skipped: number
  failed: number
  at: number
  error?: SyncErrorInfo
}

type SyncState = {
  progress: SyncProgress | null
  summary: SyncSummary | null
  lastSyncAt: number | null
  pendingCount: number
}

export const useSync = create<SyncState>(() => ({
  progress: null,
  summary: null,
  lastSyncAt: null,
  pendingCount: 0,
}))

/** data 列里保存的消息与分支信息；附件元数据随消息一起同步，原件不上传 */
type SessionData = {
  messages?: Message[]
  rootMessageId?: string | null
}

type ChatSessionRow = {
  user_id: string
  id: string
  title: string | null
  created_at_ms: number | null
  updated_at_ms: number | null
  root_message_id: string | null
  /** 列表查询不带 data；只有按 id 拉正文时才有值 */
  data?: SessionData | null
  updated_by: string | null
}

const toRow = (session: Session, userId: string): ChatSessionRow => ({
  user_id: userId,
  id: session.id,
  title: session.title,
  created_at_ms: session.createdAt,
  updated_at_ms: session.updatedAt,
  root_message_id: session.rootMessageId ?? null,
  data: { messages: session.messages, rootMessageId: session.rootMessageId ?? null },
  updated_by: deviceId,
})

const toSession = (row: ChatSessionRow): Session => ({
  id: row.id,
  title: row.title ?? '',
  createdAt: Number(row.created_at_ms) || 0,
  updatedAt: Number(row.updated_at_ms) || 0,
  messages: Array.isArray(row.data?.messages) ? row.data.messages : [],
  rootMessageId: row.data?.rootMessageId ?? row.root_message_id ?? null,
})

const currentUserId = () => useAccount.getState().user?.id

const pushRows = async (rows: ChatSessionRow[]) => {
  if (rows.length === 0) {
    return
  }
  const { error } = await supabase.rpc(PUSH_RPC, { p_rows: rows, p_device: deviceId })
  if (error) {
    throw error
  }
}

/* ------------------------------ 待上传条数 ------------------------------ */

/**
 * 待上传条数：本地摘要的 updatedAt 与「最后一次成功推送的 updatedAt」不一致即视为待上传。
 * 只读内存里的会话摘要 + localStorage 指纹，不触发 IndexedDB 读取。
 */
const refreshPendingCount = () => {
  const userId = currentUserId()
  const current = useSync.getState().pendingCount
  if (!userId) {
    if (current !== 0) {
      useSync.setState({ pendingCount: 0 })
    }
    return
  }
  const entries = readFingerprints(userId)
  let count = 0
  for (const summary of useChatStore.getState().sessions) {
    const entry = entries[summary.id]
    if (!entry || entry.u !== summary.updatedAt) {
      count += 1
    }
  }
  if (count !== current) {
    useSync.setState({ pendingCount: count })
  }
}

/* --------------------------- 自动（静默）推送 --------------------------- */

/** 待推送的会话（按 id 去重，保留最新快照） */
const pending = new Map<string, Session>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** 失败重试队列：指数退避，成功后移除 */
const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 5 * 60 * 1000
const RETRY_LIMIT = 6

type RetryEntry = { session: Session; attempts: number; timer: ReturnType<typeof setTimeout> | null }

const retries = new Map<string, RetryEntry>()

const clearRetry = (sessionId: string) => {
  const entry = retries.get(sessionId)
  if (entry?.timer) {
    clearTimeout(entry.timer)
  }
  retries.delete(sessionId)
}

const scheduleRetry = (session: Session) => {
  const previous = retries.get(session.id)
  const attempts = (previous?.attempts ?? 0) + 1
  if (attempts > RETRY_LIMIT) {
    clearRetry(session.id)
    return
  }
  if (previous?.timer) {
    clearTimeout(previous.timer)
  }
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1))
  const timer = setTimeout(() => {
    retries.set(session.id, { session, attempts, timer: null })
    pending.set(session.id, session)
    void flushSession(session.id)
  }, delay)
  retries.set(session.id, { session, attempts, timer })
}

/**
 * 推送单个会话。
 * 推送前先比对内容指纹：updatedAt 与指纹都没变则不发请求（这就是「重复上传未变化数据」的修复点）。
 * 推送成功后才写入指纹；失败不写，并把会话放进退避重试队列。
 */
const flushSession = async (sessionId: string) => {
  const session = pending.get(sessionId)
  if (!session) {
    return
  }
  pending.delete(sessionId)
  const userId = currentUserId()
  if (!userId) {
    return
  }
  const entry = readFingerprints(userId)[session.id]
  // 指纹未变：不发起请求（修复「重复上传未改变的聊天数据」）
  if (isSessionUnchanged(entry, session)) {
    if (!entry || entry.u !== session.updatedAt) {
      // 内容一致但时间戳变了：补登记一次，后续走时间戳快路径
      writeFingerprint(userId, session.id, sessionFingerprint(session), session.updatedAt)
    }
    clearRetry(session.id)
    refreshPendingCount()
    return
  }
  const fingerprint = sessionFingerprint(session)
  try {
    await pushRows([toRow(session, userId)])
    writeFingerprint(userId, session.id, fingerprint, session.updatedAt)
    clearRetry(session.id)
  } catch {
    // 自动同步失败不打扰用户：留在本地并进入退避重试队列
    scheduleRetry(session)
  } finally {
    refreshPendingCount()
  }
}

/** 会话每次落盘后调用；同一会话的连续变更合并成一次推送 */
const scheduleSessionPush = (session: Session) => {
  if (!currentUserId()) {
    return
  }
  pending.set(session.id, session)
  const timer = timers.get(session.id)
  if (timer) {
    clearTimeout(timer)
  }
  timers.set(
    session.id,
    setTimeout(() => {
      timers.delete(session.id)
      void flushSession(session.id)
    }, PUSH_DEBOUNCE_MS)
  )
  refreshPendingCount()
}

/** 手动同步开始前清空自动队列与重试队列，避免与手动流程交叉推送 */
const clearAutoQueue = () => {
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()
  pending.clear()
  for (const sessionId of [...retries.keys()]) {
    clearRetry(sessionId)
  }
}

/** 本地删除会话时同步删除云端行；未登录则什么都不做 */
const scheduleSessionDelete = (sessionId: string) => {
  const userId = currentUserId()
  if (!userId) {
    return
  }
  const timer = timers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    timers.delete(sessionId)
  }
  pending.delete(sessionId)
  clearRetry(sessionId)
  dropFingerprint(userId, sessionId)
  void supabase
    .from(CHAT_SESSIONS_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', sessionId)
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) {
        showToast({ key: 'syncDeleteFailed', type: 'error' })
      }
    })
  refreshPendingCount()
}

/* ------------------------------ 双向同步 ------------------------------ */

/** 列表页大小：只取轻量列，单页 200 条约 60KB，远离语句超时阈值 */
const PULL_PAGE_SIZE = 200
/** 需要正文时按 id 分批拉取的条数：40 条 × 约 20KB ≈ 800KB，实测约 1.5s，远低于语句超时 */
const PULL_DETAIL_BATCH = 40

/** 列表列：不含 data，743 行也只有几十 KB */
const LIST_COLUMNS = 'id,title,created_at_ms,updated_at_ms,root_message_id'
/** 正文列：仅对确需合并的会话按 id 拉取 */
const DETAIL_COLUMNS = `${LIST_COLUMNS},data`

type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/** 把 Supabase / 网络错误整理成可展示、可排查的结构 */
const toSyncError = (phase: SyncPhase, error: unknown): SyncErrorInfo => {
  const detail = (error ?? {}) as SupabaseErrorLike
  const code = typeof detail.code === 'string' ? detail.code : ''
  const rawMessage = typeof detail.message === 'string' ? detail.message : ''
  const message = rawMessage || (error instanceof Error ? error.message : String(error))
  return { phase, code, message: message || 'unknown error' }
}

/** 错误不再被静默吞掉：code / message / details / hint 全部打到控制台 */
const logSyncError = (phase: SyncPhase, error: unknown, sessionId?: string) => {
  const info = toSyncError(phase, error)
  const detail = (error ?? {}) as SupabaseErrorLike
  /* oxlint-disable-next-line eslint/no-console */
  console.error(
    `[sync] ${phase} 阶段失败${sessionId ? `（会话 ${sessionId}）` : ''}`,
    {
      code: info.code || null,
      message: info.message,
      details: detail.details ?? null,
      hint: detail.hint ?? null,
    },
    error
  )
}

/**
 * 拉取云端会话列表（轻量列 + 分页）。
 * 修复点：原先 select('*') 一次性取该用户全部 743 行（约 14.5MB）会触发 Supabase 20 秒语句超时（57014），
 * 现在只取列表需要的列并分页，每页 200 条，总响应量降到几十 KB。
 */
const fetchCloudRows = async (userId: string): Promise<ChatSessionRow[]> => {
  const rows: ChatSessionRow[] = []
  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(CHAT_SESSIONS_TABLE)
      .select(LIST_COLUMNS)
      .eq('user_id', userId)
      .order('updated_at_ms', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1)
    if (error) {
      throw error
    }
    const page = (data ?? []) as ChatSessionRow[]
    rows.push(...page)
    if (page.length < PULL_PAGE_SIZE) {
      return rows
    }
  }
}

/** 按 id 分批拉取正文列：只有真正需要合并或比对的会话才取 data */
const fetchCloudSessions = async (
  userId: string,
  ids: string[]
): Promise<Map<string, ChatSessionRow>> => {
  const details = new Map<string, ChatSessionRow>()
  for (let index = 0; index < ids.length; index += PULL_DETAIL_BATCH) {
    const slice = ids.slice(index, index + PULL_DETAIL_BATCH)
    const { data, error } = await supabase
      .from(CHAT_SESSIONS_TABLE)
      .select(DETAIL_COLUMNS)
      .eq('user_id', userId)
      .in('id', slice)
    if (error) {
      throw error
    }
    for (const row of (data ?? []) as ChatSessionRow[]) {
      details.set(row.id, row)
    }
  }
  return details
}

const isStreaming = (sessionId: string) =>
  Object.hasOwn(useChatStore.getState().streaming, sessionId)

/** 判定单条云端会话（含正文）如何与本地合并：下载 / 跳过 / 记入待上传 */
const mergeRemoteRow = async (
  userId: string,
  row: ChatSessionRow,
  local: { updatedAt: number } | undefined,
  counters: { downloaded: number; skipped: number },
  uploadIds: string[]
) => {
  const remote = toSession(row)
  if (!local || remote.updatedAt > local.updatedAt) {
    // 本地正在生成回复时不覆盖，等生成结束后的落盘再推回云端
    if (isStreaming(remote.id)) {
      counters.skipped += 1
      return
    }
    await applyRemoteSession(remote)
    writeFingerprint(userId, remote.id, sessionFingerprint(remote), remote.updatedAt)
    counters.downloaded += 1
    return
  }
  if (local.updatedAt > remote.updatedAt) {
    uploadIds.push(remote.id)
    return
  }
  const remoteFingerprint = sessionFingerprint(remote)
  const entry = readFingerprints(userId)[remote.id]
  if (entry && entry.u === remote.updatedAt && entry.f === remoteFingerprint) {
    // 上次同步过且内容一致：无需读 IndexedDB
    counters.skipped += 1
    return
  }
  const localSession = await db.loadSession(remote.id)
  if (!localSession) {
    if (isStreaming(remote.id)) {
      counters.skipped += 1
      return
    }
    await applyRemoteSession(remote)
    writeFingerprint(userId, remote.id, remoteFingerprint, remote.updatedAt)
    counters.downloaded += 1
    return
  }
  if (sessionFingerprint(localSession) === remoteFingerprint) {
    // 内容一致：登记指纹，下次同步直接走时间戳快路径
    writeFingerprint(userId, remote.id, remoteFingerprint, remote.updatedAt)
    counters.skipped += 1
    return
  }
  uploadIds.push(remote.id)
}

/**
 * 单向拉取合并：云端更新的写入本地，本地更新的收集起来等上传。
 * rows 只含轻量列（不含 data），正文按 id 分批拉取（每批 PULL_DETAIL_BATCH 条），
 * 绝大多数已同步一致的会话在第一遍就被跳过，不产生任何正文请求。
 * 返回需要上传的会话 id 列表。
 */
const pullPhase = async (
  userId: string,
  rows: ChatSessionRow[],
  counters: { downloaded: number; skipped: number; failed: number }
): Promise<string[]> => {
  const summaries = await db.loadSessionSummaries()
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]))
  const fingerprints = readFingerprints(userId)
  const uploadIds: string[] = []
  const needDetail: string[] = []
  const total = rows.length
  let done = 0
  useSync.setState({ progress: { phase: 'pull', done, total } })

  // 第一遍：只凭轻量列 + 指纹判断，不请求正文。
  // 进度口径 = 会话总数，第一遍已下结论的会话在此计数，需要拉正文的会话计在第二遍，避免重复计数
  // 指纹算法升级后旧登记不可比：先按云端正文重新核验一遍内容，一致就改写登记，避免一次性全量重传
  const outdatedFingerprints = isFingerprintOutdated(userId)
  for (const row of rows) {
    const remoteUpdatedAt = Number(row.updated_at_ms) || 0
    const local = summaryById.get(row.id)
    if (!local || remoteUpdatedAt > local.updatedAt) {
      needDetail.push(row.id)
    } else if (local.updatedAt > remoteUpdatedAt) {
      uploadIds.push(row.id)
      done += 1
    } else {
      const entry = fingerprints[row.id]
      if (entry && entry.u === remoteUpdatedAt && !outdatedFingerprints) {
        counters.skipped += 1
        done += 1
      } else {
        needDetail.push(row.id)
      }
    }
  }
  useSync.setState({ progress: { phase: 'pull', done, total } })

  // 第二遍：仅对需要的会话分批拉正文后合并
  for (let index = 0; index < needDetail.length; index += PULL_DETAIL_BATCH) {
    const slice = needDetail.slice(index, index + PULL_DETAIL_BATCH)
    let details: Map<string, ChatSessionRow>
    try {
      details = await fetchCloudSessions(userId, slice)
    } catch (error) {
      logSyncError('pull', error)
      counters.failed += slice.length
      done += slice.length
      useSync.setState({ progress: { phase: 'pull', done, total } })
      continue
    }
    for (const sessionId of slice) {
      try {
        const row = details.get(sessionId)
        if (!row) {
          // 拉取期间被其它设备删除：跳过，下一轮由推送阶段补传
          counters.skipped += 1
          uploadIds.push(sessionId)
        } else {
          await mergeRemoteRow(userId, row, summaryById.get(sessionId), counters, uploadIds)
        }
      } catch (error) {
        logSyncError('pull', error, sessionId)
        counters.failed += 1
      }
      done += 1
      useSync.setState({ progress: { phase: 'pull', done, total } })
    }
  }
  // 只有整轮核验没有失败，才把登记标记成新口径
  if (counters.failed === 0) {
    markFingerprintVersion(userId)
  }
  return uploadIds
}

/** 推送阶段：跳过指纹未变的会话，成功后登记指纹 */
const pushPhase = async (
  userId: string,
  uploadIds: string[],
  counters: { uploaded: number; skipped: number; failed: number }
) => {
  const total = uploadIds.length
  let done = 0
  if (total === 0) {
    // 没有待上传时不改写进度，避免把 pull 的 100% 覆盖成「上传中 0/0」
    return
  }
  useSync.setState({ progress: { phase: 'push', done, total } })
  for (let index = 0; index < uploadIds.length; index += PUSH_BATCH_SIZE) {
    const batchIds = uploadIds.slice(index, index + PUSH_BATCH_SIZE)
    const rows: ChatSessionRow[] = []
    const accepted: { id: string; fingerprint: string; updatedAt: number }[] = []
    for (const id of batchIds) {
      const session = await db.loadSession(id)
      done += 1
      if (!session) {
        counters.skipped += 1
      } else {
        const entry = readFingerprints(userId)[id]
        const fingerprint = sessionFingerprint(session)
        // 只按内容指纹判断是否已同步；updatedAt 相同但内容更新的会话必须上传
        if (entry && entry.f === fingerprint) {
          counters.skipped += 1
        } else {
          rows.push(toRow(session, userId))
          accepted.push({ id, fingerprint, updatedAt: session.updatedAt })
        }
      }
      useSync.setState({ progress: { phase: 'push', done, total } })
    }
    if (rows.length === 0) {
      continue
    }
    try {
      await pushRows(rows)
      for (const item of accepted) {
        writeFingerprint(userId, item.id, item.fingerprint, item.updatedAt)
      }
      counters.uploaded += rows.length
    } catch {
      // 失败的会话不写指纹，下次同步会重试
      counters.failed += rows.length
    }
  }
}

/**
 * 收集本次需要上传的本地会话。
 * 云端缺失的一律补传；时间戳与指纹记录不一致的视为改动过。
 * verifyContent 为真时（手动同步）额外按内容指纹复核「时间戳没变」的会话：
 * 助手回答收尾曾经不推进 updatedAt，只看时间戳会把这些会话永久判成已同步。
 */
const collectLocalChanges = async (
  userId: string,
  remoteIds: Set<string>,
  pulled: boolean,
  verifyContent: boolean
): Promise<string[]> => {
  const uploadIds: string[] = []
  const summaries = await db.loadSessionSummaries()
  const fingerprints = readFingerprints(userId)
  for (const summary of summaries) {
    const entry = fingerprints[summary.id]
    // 拉取成功时：云端缺失的本地会话也要补传；拉取失败时不做全量上传
    if (pulled && !remoteIds.has(summary.id)) {
      uploadIds.push(summary.id)
      continue
    }
    if (!entry || entry.u !== summary.updatedAt) {
      uploadIds.push(summary.id)
      continue
    }
    if (!verifyContent) {
      continue
    }
    const session = await db.loadSession(summary.id)
    if (session && entry.f !== sessionFingerprint(session)) {
      uploadIds.push(summary.id)
    }
  }
  return uploadIds
}

/**
 * 一次完整同步：先拉后推，一个进度条贯穿两个阶段。
 * 关键修复：pull 失败不再中断整个同步，上传阶段照常执行；两阶段错误都写进 summary.error 并打到控制台。
 */
const runSync = async (verifyContent: boolean): Promise<SyncSummary> => {
  const userId = currentUserId()
  const empty: SyncSummary = { downloaded: 0, uploaded: 0, skipped: 0, failed: 0, at: Date.now() }
  if (!userId) {
    return empty
  }
  clearAutoQueue()
  const counters = { downloaded: 0, uploaded: 0, skipped: 0, failed: 0 }
  const uploadIds: string[] = []
  let remoteRows: ChatSessionRow[] = []
  let pulled = false
  let syncError: SyncErrorInfo | undefined
  try {
    try {
      remoteRows = await fetchCloudRows(userId)
      pulled = true
      uploadIds.push(...(await pullPhase(userId, remoteRows, counters)))
    } catch (error) {
      // 拉取失败先记错，继续往下推送，避免「下载失败」把「上传」一并挡死
      syncError = toSyncError('pull', error)
      logSyncError('pull', error)
    }
    try {
      const remoteIds = new Set(remoteRows.map((row) => row.id))
      const changedIds = await collectLocalChanges(userId, remoteIds, pulled, verifyContent)
      uploadIds.push(...changedIds)
      await pushPhase(userId, [...new Set(uploadIds)], counters)
    } catch (error) {
      syncError = syncError ?? toSyncError('push', error)
      logSyncError('push', error)
    }
    const at = Date.now()
    const summary: SyncSummary = {
      ...counters,
      at,
      ...(syncError ? { error: syncError } : {}),
    }
    writeLastSyncAt(userId, at)
    useSync.setState({ summary, lastSyncAt: at })
    return summary
  } finally {
    useSync.setState({ progress: null })
    refreshPendingCount()
  }
}

let running: Promise<SyncSummary> | null = null
let runningVerify = false

/**
 * 手动「同步」按钮入口；并发调用复用同一次同步。
 * 手动同步默认做内容级校验（verify=true），保证「内容比已推送版本新」的会话一定上传。
 */
export const syncAll = (options?: { verify?: boolean }): Promise<SyncSummary> => {
  const verify = options?.verify ?? true
  if (running) {
    // 正在跑静默同步（不做内容校验）时，手动同步等它结束后再补一次带校验的同步
    return runningVerify || !verify ? running : running.then(() => syncAll({ verify }))
  }
  const task = runSync(verify).finally(() => {
    if (running === task) {
      running = null
      runningVerify = false
    }
  })
  running = task
  runningVerify = verify
  return task
}

/** 静默同步节流窗口：焦点切换/网络恢复时不至于反复请求 */
const AUTO_SYNC_MIN_INTERVAL = 30_000
let autoSyncAt = 0
let syncingSilently = false

/** 登录成功、窗口聚焦、回到前台、网络恢复时的静默双向同步（不弹 toast、失败不打断） */
export const requestSilentSync = (options?: { force?: boolean }) => {
  if (!currentUserId()) {
    return
  }
  const now = Date.now()
  if (!options?.force && now - autoSyncAt < AUTO_SYNC_MIN_INTERVAL) {
    return
  }
  if (syncingSilently) {
    return
  }
  autoSyncAt = now
  syncingSilently = true
  void syncAll({ verify: false })
    .catch(() => {
      // 静默失败：数据仍在本地，下次触发或手动同步会补上
    })
    .finally(() => {
      syncingSilently = false
    })
}

/* ------------------------------ 实时订阅 ------------------------------ */

type ChangePayload = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: unknown; old: unknown }

const handleChange = async (payload: ChangePayload) => {
  if (payload.eventType === 'DELETE') {
    const old = (payload.old ?? {}) as Partial<ChatSessionRow>
    if (!old.id) {
      return
    }
    // 本设备删除后收到的回声，本地已经删掉了
    if (old.updated_by === deviceId) {
      return
    }
    await dropLocalSession(old.id)
    const userId = currentUserId()
    if (userId) {
      dropFingerprint(userId, old.id)
    }
    refreshPendingCount()
    return
  }
  const row = payload.new as ChatSessionRow
  if (!row?.id) {
    return
  }
  // 忽略本设备写入的回声
  if (row.updated_by === deviceId) {
    return
  }
  const remote = toSession(row)
  const local = await db.loadSession(row.id)
  if (local && local.updatedAt >= remote.updatedAt) {
    return
  }
  // 本地正在生成回复时不覆盖，生成结束后的落盘会以更新的时间戳推回云端
  if (isStreaming(row.id)) {
    return
  }
  await applyRemoteSession(remote)
  const userId = currentUserId()
  if (userId) {
    writeFingerprint(userId, row.id, sessionFingerprint(remote), remote.updatedAt)
  }
  refreshPendingCount()
}

/** 实时变更串行处理，避免同一会话的 INSERT/UPDATE 并发写库 */
let queue: Promise<void> = Promise.resolve()

const enqueueChange = (payload: ChangePayload) => {
  queue = queue.then(() => handleChange(payload)).catch(() => {
    // 单条实时变更失败不影响后续消息，本地数据仍可由手动「同步」补齐
  })
}

let channel: RealtimeChannel | null = null

const stopRealtime = () => {
  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
}

/** 订阅本用户的会话表变更（INSERT/UPDATE/DELETE） */
const startRealtime = (userId: string) => {
  stopRealtime()
  channel = supabase
    .channel(`chat_sessions:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CHAT_SESSIONS_TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        enqueueChange(payload as ChangePayload)
      }
    )
    .subscribe()
}

/** 页面重新可见 / 窗口聚焦 / 网络恢复时的静默增量同步 */
const bindAutoSyncTriggers = () => {
  window.addEventListener('focus', () => requestSilentSync())
  window.addEventListener('online', () => requestSilentSync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestSilentSync()
    }
  })
}

const applyAccount = (userId: string | null, previousId: string | null) => {
  if (userId === previousId) {
    return
  }
  if (previousId) {
    // 退出登录 / 切换账号：清掉上一个账号的指纹缓存与附件清单，避免串号
    clearFingerprints(previousId)
    clearCloudFileCache()
    clearAutoQueue()
  }
  if (userId) {
    startRealtime(userId)
    useSync.setState({ lastSyncAt: readLastSyncAt(userId) })
    refreshPendingCount()
    // 登录成功后静默跑一次双向同步
    requestSilentSync({ force: true })
  } else {
    stopRealtime()
    useSync.setState({ progress: null, summary: null, lastSyncAt: null, pendingCount: 0 })
  }
}

let started = false

/** 在应用启动时调用一次：恢复登录态、注册本地变更钩子、按登录状态开关实时订阅 */
export const startCloudSync = () => {
  if (started) {
    return
  }
  started = true
  setChatSyncHandlers({
    saved: (session) => {
      scheduleSessionPush(session)
      scheduleAttachmentSync(session)
    },
    deleted: scheduleSessionDelete,
  })
  bindAutoSyncTriggers()
  useAccount.subscribe((state, previous) => {
    applyAccount(state.user?.id ?? null, previous.user?.id ?? null)
  })
  void initAccount().then(() => {
    applyAccount(useAccount.getState().user?.id ?? null, null)
  })
}
