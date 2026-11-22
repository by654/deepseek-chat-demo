import { log } from './logs.js'
import { supabase } from './supabase/client.js'

/** 档案表与 RPC 名称集中在此，方便与 supabase/user_admin.sql 对齐 */
const PROFILES_TABLE = 'profiles'
const RPC_IS_ADMIN = 'is_admin'
const RPC_SET_NICKNAME = 'set_nickname'
const RPC_ADMIN_LIST_USERS = 'admin_list_users'
const RPC_ADMIN_SET_STATUS = 'admin_set_status'
const RPC_ADMIN_DELETE_USER = 'admin_delete_user'

/** 引导用户去 Supabase SQL Editor 执行的脚本路径 */
export const PROFILE_SQL_PATH = 'supabase/user_admin.sql'
export const NICKNAME_MAX_LENGTH = 24
export const PASSWORD_MIN_LENGTH = 6

export type ProfileStatus = 'active' | 'disabled'

export type Profile = {
  id: string
  username: string
  nickname: string
  status: ProfileStatus
}

export type AdminUser = {
  id: string
  email: string
  username: string
  nickname: string
  status: ProfileStatus
  /** 注册时间（ISO 字符串，可能为空） */
  createdAt: string
  /** 最后登录时间（ISO 字符串，从未登录为 null） */
  lastSignInAt: string | null
  /** 云端会话条数 */
  sessionCount: number
}

/**
 * 失败原因：
 * - schemaMissing：表或 RPC 还不存在，说明 user_admin.sql 没执行，界面要给引导提示
 * - notAllowed：权限不足（RLS / 非管理员）
 * - network：网络异常
 * - unknown：其它
 */
export type ProfileFailureReason = 'schemaMissing' | 'notAllowed' | 'network' | 'unknown'

export type ProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ProfileFailureReason; message: string }

/** PostgREST / PostgreSQL 中表示「对象不存在」的错误码 */
const MISSING_SCHEMA_CODES = new Set(['42P01', '42883', '42P17', 'PGRST106', 'PGRST202', 'PGRST205'])

const MISSING_SCHEMA_HINTS = [
  'does not exist',
  'could not find the function',
  'could not find the table',
  'schema cache',
  'undefined table',
  'undefined function',
]

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** rpc 有时返回单行对象、有时返回数组（复合类型 / setof），统一取第一行 */
const toRow = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    return value.length > 0 ? asRecord(value[0]) : null
  }
  return asRecord(value)
}

const readError = (error: unknown): { code: string; message: string } => {
  const record = asRecord(error)
  if (record) {
    const parts = [record.message, record.details, record.hint].filter(
      (item): item is string => typeof item === 'string' && item !== '',
    )
    return {
      code: asText(record.code),
      message: parts.join(' · '),
    }
  }
  return { code: '', message: typeof error === 'string' ? error : '' }
}

export const classifyFailure = (error: unknown): { reason: ProfileFailureReason; message: string } => {
  const { code, message } = readError(error)
  const lower = message.toLowerCase()
  if (MISSING_SCHEMA_CODES.has(code) || MISSING_SCHEMA_HINTS.some((hint) => lower.includes(hint))) {
    return { reason: 'schemaMissing', message }
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return { reason: 'network', message }
  }
  if (code === '42501' || lower.includes('permission denied') || lower.includes('row-level security')) {
    return { reason: 'notAllowed', message }
  }
  return { reason: 'unknown', message }
}

/** 统一记录失败：写项目内结构化日志，同时输出 console 便于本地排查 */
const reportFailure = (scope: string, error: unknown) => {
  const { code, message } = readError(error)
  log('error', scope, { code, message })
  /* oxlint-disable-next-line eslint/no-console */
  console.error(`[profile] ${scope}`, { code, message })
}

const normalizeProfile = (row: Record<string, unknown>): Profile => ({
  id: asText(row.id),
  username: asText(row.username),
  nickname: asText(row.nickname),
  status: row.status === 'disabled' ? 'disabled' : 'active',
})

const normalizeAdminUser = (row: Record<string, unknown>): AdminUser => {
  const rawCount = row.session_count
  const sessionCount =
    typeof rawCount === 'number' ? rawCount : Number.parseInt(String(rawCount ?? '0'), 10) || 0
  const lastSignIn = asText(row.last_sign_in_at)
  return {
    id: asText(row.id),
    email: asText(row.email),
    username: asText(row.username),
    nickname: asText(row.nickname),
    status: row.status === 'disabled' ? 'disabled' : 'active',
    createdAt: asText(row.created_at),
    lastSignInAt: lastSignIn === '' ? null : lastSignIn,
    sessionCount,
  }
}

/** 读取当前登录用户自己的档案；档案不存在时返回 null（历史账号尚未建档） */
export const fetchProfile = async (userId: string): Promise<ProfileResult<Profile | null>> => {
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('id, username, nickname, status')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      reportFailure('fetchProfile', error)
      return { ok: false, ...classifyFailure(error) }
    }

    const row = asRecord(data)
    return { ok: true, value: row ? normalizeProfile(row) : null }
  } catch (error) {
    reportFailure('fetchProfile', error)
    return { ok: false, ...classifyFailure(error) }
  }
}

/** 修改自己的昵称（走 set_nickname RPC，长度与非空由数据库再校验一次） */
export const saveNickname = async (nickname: string): Promise<ProfileResult<Profile>> => {
  try {
    const { data, error } = await supabase.rpc(RPC_SET_NICKNAME, { p_nickname: nickname.trim() })
    if (error) {
      reportFailure('saveNickname', error)
      return { ok: false, ...classifyFailure(error) }
    }
    const row = toRow(data)
    if (!row) {
      return { ok: false, reason: 'unknown', message: 'set_nickname 未返回档案行' }
    }
    return { ok: true, value: normalizeProfile(row) }
  } catch (error) {
    reportFailure('saveNickname', error)
    return { ok: false, ...classifyFailure(error) }
  }
}

/** 修改密码：当前密码不参与校验，直接 updateUser（新密码长度由调用方先行校验） */
export const updatePassword = async (password: string): Promise<ProfileResult<null>> => {
  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      reportFailure('updatePassword', error)
      return { ok: false, ...classifyFailure(error) }
    }
    return { ok: true, value: null }
  } catch (error) {
    reportFailure('updatePassword', error)
    return { ok: false, ...classifyFailure(error) }
  }
}

/** 是否管理员；RPC 不存在（脚本未执行）或出错时一律按「非管理员」处理，界面不显示入口 */
export const checkIsAdmin = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc(RPC_IS_ADMIN, { p_user_id: userId })
    if (error) {
      reportFailure('checkIsAdmin', error)
      return false
    }
    return data === true
  } catch (error) {
    reportFailure('checkIsAdmin', error)
    return false
  }
}

/** 管理员：拉取全部用户 */
export const adminListUsers = async (): Promise<ProfileResult<AdminUser[]>> => {
  try {
    const { data, error } = await supabase.rpc(RPC_ADMIN_LIST_USERS)
    if (error) {
      reportFailure('adminListUsers', error)
      return { ok: false, ...classifyFailure(error) }
    }
    const rows = Array.isArray(data) ? data : data === null || data === undefined ? [] : [data]
    const users = rows
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item) => normalizeAdminUser(item))
    return { ok: true, value: users }
  } catch (error) {
    reportFailure('adminListUsers', error)
    return { ok: false, ...classifyFailure(error) }
  }
}

/** 管理员：启用 / 禁用某个用户 */
export const adminSetStatus = async (
  userId: string,
  status: ProfileStatus,
): Promise<ProfileResult<null>> => {
  try {
    const { error } = await supabase.rpc(RPC_ADMIN_SET_STATUS, {
      p_user_id: userId,
      p_status: status,
    })
    if (error) {
      reportFailure('adminSetStatus', error)
      return { ok: false, ...classifyFailure(error) }
    }
    return { ok: true, value: null }
  } catch (error) {
    reportFailure('adminSetStatus', error)
    return { ok: false, ...classifyFailure(error) }
  }
}

/** 管理员：删除某个用户（会话 + 档案 + auth 用户） */
export const adminDeleteUser = async (userId: string): Promise<ProfileResult<null>> => {
  try {
    const { error } = await supabase.rpc(RPC_ADMIN_DELETE_USER, { p_user_id: userId })
    if (error) {
      reportFailure('adminDeleteUser', error)
      return { ok: false, ...classifyFailure(error) }
    }
    return { ok: true, value: null }
  } catch (error) {
    reportFailure('adminDeleteUser', error)
    return { ok: false, ...classifyFailure(error) }
  }
}

/** 把 ISO 时间格式成「年-月-日 时:分」，空值返回空串 */
export const formatDateTime = (iso: string | null): string => {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
