import { log } from './logs.js'
import { supabase } from './supabase/client.js'

/** 公告、反馈、审计等新增能力的初始化脚本路径 */
export const FEATURES_SQL_PATH = 'supabase/features.sql'

/** 公告级别：普通 / 重要 / 更新 */
export type AnnouncementLevel = 'info' | 'warning' | 'success'

export type Announcement = {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  active: boolean
  createdAt: string
  expiresAt: string | null
}

export type FeedbackItem = {
  id: string
  username: string
  content: string
  contact: string
  page: string
  status: 'open' | 'resolved'
  createdAt: string
}

export type AuditItem = {
  id: number
  actorName: string
  action: string
  target: string
  detail: string
  createdAt: string
}

export type AdminStats = {
  users: number
  sessions: number
  shares: number
  feedbackOpen: number
  announcements: number
  storageBytes: number
  newUsers7d: number
  activeUsers7d: number
}

export type AnnouncementInput = {
  id: string | null
  title: string
  body: string
  level: AnnouncementLevel
  active: boolean
  expiresAt: string | null
}

const asText = (value: unknown) => (typeof value === 'string' ? value : '')

const asNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const rowsOf = (value: unknown): Record<string, unknown>[] =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)

const normalizeLevel = (value: unknown): AnnouncementLevel =>
  value === 'warning' || value === 'success' ? value : 'info'

const normalizeAnnouncement = (row: Record<string, unknown>): Announcement => ({
  id: asText(row.id),
  title: asText(row.title),
  body: asText(row.body),
  level: normalizeLevel(row.level),
  active: row.active !== false,
  createdAt: asText(row.created_at),
  expiresAt: asText(row.expires_at) || null,
})

const report = (scope: string, error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  log('error', scope, { message })
}

/** 用户端：当前有效公告（未登录也可读） */
export const listActiveAnnouncements = async (): Promise<Announcement[]> => {
  try {
    const { data, error } = await supabase.rpc('list_active_announcements')
    if (error) {
      report('listActiveAnnouncements', error)
      return []
    }
    return rowsOf(data).map(normalizeAnnouncement)
  } catch (error) {
    report('listActiveAnnouncements', error)
    return []
  }
}

/** 管理员：全部公告 */
export const adminListAnnouncements = async (): Promise<Announcement[]> => {
  try {
    const { data, error } = await supabase.rpc('admin_list_announcements')
    if (error) {
      report('adminListAnnouncements', error)
      return []
    }
    return rowsOf(data).map(normalizeAnnouncement)
  } catch (error) {
    report('adminListAnnouncements', error)
    return []
  }
}

/** 管理员：新建或更新公告 */
export const adminSaveAnnouncement = async (input: AnnouncementInput): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('admin_save_announcement', {
      p_id: input.id,
      p_title: input.title,
      p_body: input.body,
      p_level: input.level,
      p_active: input.active,
      p_expires_at: input.expiresAt,
    })
    if (error) {
      report('adminSaveAnnouncement', error)
      return false
    }
    return true
  } catch (error) {
    report('adminSaveAnnouncement', error)
    return false
  }
}

/** 管理员：删除公告 */
export const adminDeleteAnnouncement = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('admin_delete_announcement', { p_id: id })
    if (error) {
      report('adminDeleteAnnouncement', error)
      return false
    }
    return true
  } catch (error) {
    report('adminDeleteAnnouncement', error)
    return false
  }
}

/** 登录用户提交反馈 */
export const submitFeedback = async (
  content: string,
  contact: string,
  page: string
): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('submit_feedback', {
      p_content: content,
      p_contact: contact,
      p_page: page,
    })
    if (error) {
      report('submitFeedback', error)
      return false
    }
    return true
  } catch (error) {
    report('submitFeedback', error)
    return false
  }
}

const normalizeFeedback = (row: Record<string, unknown>): FeedbackItem => ({
  id: asText(row.id),
  username: asText(row.username),
  content: asText(row.content),
  contact: asText(row.contact),
  page: asText(row.page),
  status: row.status === 'resolved' ? 'resolved' : 'open',
  createdAt: asText(row.created_at),
})

/** 管理员：反馈列表，可按状态筛选 */
export const adminListFeedback = async (status: '' | 'open' | 'resolved'): Promise<FeedbackItem[]> => {
  try {
    const { data, error } = await supabase.rpc('admin_list_feedback', {
      p_status: status === '' ? null : status,
    })
    if (error) {
      report('adminListFeedback', error)
      return []
    }
    return rowsOf(data).map(normalizeFeedback)
  } catch (error) {
    report('adminListFeedback', error)
    return []
  }
}

/** 管理员：标记反馈状态 */
export const adminSetFeedbackStatus = async (
  id: string,
  status: 'open' | 'resolved'
): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('admin_set_feedback_status', {
      p_id: id,
      p_status: status,
    })
    if (error) {
      report('adminSetFeedbackStatus', error)
      return false
    }
    return true
  } catch (error) {
    report('adminSetFeedbackStatus', error)
    return false
  }
}

/** 管理员：删除反馈 */
export const adminDeleteFeedback = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('admin_delete_feedback', { p_id: id })
    if (error) {
      report('adminDeleteFeedback', error)
      return false
    }
    return true
  } catch (error) {
    report('adminDeleteFeedback', error)
    return false
  }
}

const normalizeAudit = (row: Record<string, unknown>): AuditItem => {
  const detail = asRecord(row.detail)
  return {
    id: asNumber(row.id),
    actorName: asText(row.actor_name),
    action: asText(row.action),
    target: asText(row.target),
    detail: detail ? JSON.stringify(detail) : '',
    createdAt: asText(row.created_at),
  }
}

/** 管理员：审计日志 */
export const adminListAudit = async (limit = 200): Promise<AuditItem[]> => {
  try {
    const { data, error } = await supabase.rpc('admin_list_audit', { p_limit: limit })
    if (error) {
      report('adminListAudit', error)
      return []
    }
    return rowsOf(data).map(normalizeAudit)
  } catch (error) {
    report('adminListAudit', error)
    return []
  }
}

/** 管理员：站点概览 */
export const adminStats = async (): Promise<AdminStats | null> => {
  try {
    const { data, error } = await supabase.rpc('admin_stats')
    if (error) {
      report('adminStats', error)
      return null
    }
    const row = asRecord(data)
    if (!row) {
      return null
    }
    return {
      users: asNumber(row.users),
      sessions: asNumber(row.sessions),
      shares: asNumber(row.shares),
      feedbackOpen: asNumber(row.feedbackOpen),
      announcements: asNumber(row.announcements),
      storageBytes: asNumber(row.storageBytes),
      newUsers7d: asNumber(row.newUsers7d),
      activeUsers7d: asNumber(row.activeUsers7d),
    }
  } catch (error) {
    report('adminStats', error)
    return null
  }
}
