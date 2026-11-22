import type { Session as AuthSession } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { TranslationKey } from '../i18n/index.js'
import { needsMfaChallenge } from './mfa.js'
import { supabase } from './supabase/client.js'
import { USERNAME_EMAIL_DOMAIN } from './supabase/config.js'

/** 已登录账号：id 是 Supabase Auth 的 user id（即云端表里的 user_id） */
export type AccountUser = {
  id: string
  username: string
}

type AccountState = {
  /** 是否已尝试读取过本地登录态（无论最终是否登录） */
  ready: boolean
  user: AccountUser | null
  /** 已绑定验证器，但本次登录还没完成 AAL2 校验 */
  mfaRequired: boolean
  mfaFactorId: string | null
}

export const useAccount = create<AccountState>(() => ({
  ready: false,
  user: null,
  mfaRequired: false,
  mfaFactorId: null,
}))

/** 用户名只允许 2-20 位的字母、数字、下划线、中文 */
const USERNAME_PATTERN = /^[a-z0-9_\u4e00-\u9fa5]{2,20}$/

/** 统一规范化：去空格、转小写，避免「Zhang San」和「zhangsan」注册成两个账号 */
export const normalizeUsername = (raw: string) => raw.trim().replace(/\s+/g, '').toLowerCase()

/** 用户名 → 伪邮箱，交给 Supabase Auth 的邮箱密码体系 */
export const usernameToEmail = (username: string) =>
  `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`

export const isValidUsername = (username: string) => USERNAME_PATTERN.test(username)

const pickUsername = (session: AuthSession | null): AccountUser | null => {
  const user = session?.user
  if (!user) {
    return null
  }
  const metadata = user.user_metadata as { username?: unknown } | undefined
  const username =
    typeof metadata?.username === 'string' && metadata.username
      ? metadata.username
      : (user.email ?? '').split('@')[0]
  return { id: user.id, username }
}

const applySession = (session: AuthSession | null) => {
  const next = pickUsername(session)
  const current = useAccount.getState()
  // 相同账号不重复写状态，避免无意义的重渲染
  if (current.ready && current.user?.id === next?.id && current.user?.username === next?.username) {
    return
  }
  useAccount.setState({
    ready: true,
    user: next,
    mfaRequired: false,
    mfaFactorId: null,
  })
  void refreshMfaState()
}

/** 读取 AAL 状态：绑定了验证器且尚未完成二次校验时要求验证 */
export const refreshMfaState = async (): Promise<void> => {
  if (!useAccount.getState().user) {
    useAccount.setState({ mfaRequired: false, mfaFactorId: null })
    return
  }
  const result = await needsMfaChallenge()
  useAccount.setState({ mfaRequired: result.required, mfaFactorId: result.factorId })
}

/** Supabase 返回英文报错，这里统一映射成中文提示用的文案键 */
const describeAuthError = (error: { message?: string } | null): TranslationKey => {
  const message = error?.message?.toLowerCase() ?? ''
  if (
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists')
  ) {
    return 'authErrorUsernameTaken'
  }
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return 'authErrorInvalidCredentials'
  }
  if (
    message.includes('password should be') ||
    message.includes('password is too short') ||
    message.includes('weak password')
  ) {
    return 'authErrorPasswordTooShort'
  }
  if (message.includes('email not confirmed')) {
    return 'authErrorEmailConfirmRequired'
  }
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('for security purposes')
  ) {
    return 'authErrorRateLimited'
  }
  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed')
  ) {
    return 'authErrorNetwork'
  }
  return 'authErrorUnknown'
}

let initTask: Promise<void> | undefined

/** 读取已持久化的登录态，并订阅后续登录/登出；重复调用只执行一次 */
export const initAccount = () => {
  initTask ??= (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      applySession(data.session)
    } catch {
      applySession(null)
    }
    supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })
  })()
  return initTask
}

const validate = (rawUsername: string, password: string): TranslationKey | null => {
  if (!isValidUsername(normalizeUsername(rawUsername))) {
    return 'authUsernameInvalid'
  }
  if (password.length < 6) {
    return 'authPasswordTooShort'
  }
  return null
}

/** 登录；返回 null 表示成功，否则返回可直接展示的错误文案键 */
export const signIn = async (
  rawUsername: string,
  password: string
): Promise<TranslationKey | null> => {
  const invalid = validate(rawUsername, password)
  if (invalid) {
    return invalid
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(rawUsername),
    password,
  })
  return error ? describeAuthError(error) : null
}

/** 注册；注册成功即登录（项目已关闭邮箱确认时 signUp 直接返回 session） */
export const signUp = async (
  rawUsername: string,
  password: string
): Promise<TranslationKey | null> => {
  const invalid = validate(rawUsername, password)
  if (invalid) {
    return invalid
  }
  const username = normalizeUsername(rawUsername)
  const email = usernameToEmail(username)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })
  if (error) {
    return describeAuthError(error)
  }
  if (!data.session) {
    // 少数项目配置下注册不会直接返回会话，补一次登录口令
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      return describeAuthError(signInError)
    }
  }
  return null
}

/** 退出登录；网络异常时退回只清本地会话，保证界面上确实退出 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    await supabase.auth.signOut({ scope: 'local' })
  }
}
