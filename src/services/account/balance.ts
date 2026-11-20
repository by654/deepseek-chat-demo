import { create } from 'zustand'
import { API_ORIGIN, request } from '../api/client.js'

/** 余额查询结果：ok=可用，unavailable=接口不存在，error=请求失败 */
type BalanceStatus = 'idle' | 'loading' | 'ok' | 'unavailable' | 'error'

type BalanceState = {
  status: BalanceStatus
  /** 总余额（接口原样字符串，避免浮点误差） */
  total: string | null
  currency: string | null
  /** 赠金余额 */
  granted: string | null
  /** 充值余额 */
  toppedUp: string | null
  /** 账户是否可用（欠费时为 false） */
  available: boolean
  /** 失败原因：接口返回的错误码或网络错误信息 */
  reason: string | null
  updatedAt: number | null
  /** 请求进行中的去重标记 */
  pending: boolean
}

const initialState: BalanceState = {
  status: 'idle',
  total: null,
  currency: null,
  granted: null,
  toppedUp: null,
  available: true,
  reason: null,
  updatedAt: null,
  pending: false,
}

export const useBalance = create<BalanceState>(() => initialState)

const BALANCE_URL = `${API_ORIGIN}/user/balance`
/** 连续失败后停止自动刷新的阈值，避免无效请求 */
const MAX_AUTO_REFRESH_FAILURES = 3

type BalancePayload = {
  is_available?: unknown
  balance_infos?: unknown
}

const pickInfo = (payload: BalancePayload) => {
  const infos = Array.isArray(payload.balance_infos) ? payload.balance_infos : []
  const first = infos[0] as Record<string, unknown> | undefined
  if (!first) {
    return null
  }
  const text = (value: unknown) => (typeof value === 'string' ? value : null)
  return {
    currency: text(first.currency),
    total: text(first.total_balance),
    granted: text(first.granted_balance),
    toppedUp: text(first.topped_up_balance),
  }
}

/** 读取接口错误的 HTTP 状态码与错误码，用于区分「接口不存在」与「请求失败」 */
const readFailure = (error: unknown): { status: number | null; reason: string } => {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const status = typeof record.status === 'number' ? record.status : null
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null
    return { status, reason: code ?? message ?? 'request failed' }
  }
  return { status: null, reason: String(error) }
}

/**
 * 查询账户余额。接口不可用（404 / 无此端点）时标记为 unavailable 并在界面说明原因，
 * 任何情况下都不编造余额数值。
 */
export const refreshBalance = async (apiKey: string | null, signal?: AbortSignal) => {
  const state = useBalance.getState()
  if (state.pending) {
    return
  }
  if (!apiKey) {
    useBalance.setState({ ...initialState, status: 'unavailable', reason: 'missing-api-key' })
    return
  }
  useBalance.setState({ pending: true, status: 'loading', reason: null })
  try {
    const response = await request(BALANCE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    })
    const payload = (await response.json()) as BalancePayload
    const info = pickInfo(payload)
    if (!info || info.total === null) {
      useBalance.setState({
        ...initialState,
        status: 'unavailable',
        reason: 'unexpected-payload',
      })
      return
    }
    useBalance.setState({
      status: 'ok',
      total: info.total,
      currency: info.currency ?? 'CNY',
      granted: info.granted,
      toppedUp: info.toppedUp,
      available: payload.is_available !== false,
      reason: null,
      updatedAt: Date.now(),
      pending: false,
    })
  } catch (error) {
    const failure = readFailure(error)
    useBalance.setState({
      ...initialState,
      status: failure.status === 404 || failure.status === 405 ? 'unavailable' : 'error',
      reason: failure.reason,
    })
  }
}

let timer: number | null = null
let failures = 0

const clearTimer = () => {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

/** 按分钟设置自动刷新间隔；0 表示关闭。失败达到上限后自动停止，避免持续无效请求 */
export const configureBalanceAutoRefresh = (minutes: number, getApiKey: () => string | null) => {
  clearTimer()
  failures = 0
  if (!minutes || minutes <= 0) {
    return
  }
  timer = window.setInterval(() => {
    if (failures >= MAX_AUTO_REFRESH_FAILURES) {
      clearTimer()
      return
    }
    const before = useBalance.getState().updatedAt
    void refreshBalance(getApiKey()).then(() => {
      const state = useBalance.getState()
      if (state.status === 'error' && state.updatedAt === before) {
        failures += 1
      } else {
        failures = 0
      }
    })
  }, minutes * 60_000)
}

/** 手动刷新时重置失败计数并立即请求 */
export const refreshBalanceNow = (apiKey: string | null) => {
  failures = 0
  return refreshBalance(apiKey)
}
