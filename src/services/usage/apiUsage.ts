import { create } from 'zustand'
import type { TranslationKey } from '../../i18n/index.js'

/**
 * 本机 API 调用统计：不记录请求内容，只累计各类接口的调用次数与失败次数。
 * 余额、语音与文件接口目前没有按 token 的公开单价，费用单独展示为「未单列计费」，
 * 避免把官方未公布的票价写入估算。
 */
export type ApiCallKind =
  | 'chat'
  | 'balance'
  | 'tts'
  | 'asr'
  | 'upload'
  | 'fileDelete'
  | 'verify'
  | 'other'

export const API_CALL_KINDS: readonly ApiCallKind[] = [
  'chat',
  'balance',
  'tts',
  'asr',
  'upload',
  'fileDelete',
  'verify',
  'other',
]

/** 设置页与会话明细共用的接口名称 */
export const API_CALL_LABELS: Record<ApiCallKind, TranslationKey> = {
  chat: 'statusChatRequests',
  balance: 'statusApiBalance',
  tts: 'statusApiTts',
  asr: 'statusApiAsr',
  upload: 'statusApiUpload',
  fileDelete: 'statusApiFileDelete',
  verify: 'statusApiVerify',
  other: 'statusApiOther',
}

/** 计数不在 UI 中单独展示的接口（如余额检查）也保留，便于排查 */
export type ApiCallStats = { success: number; failure: number }

export type ApiUsageState = {
  calls: Record<ApiCallKind, ApiCallStats>
  /** 朗读合成的字符数，用于估算语音用量 */
  ttsChars: number
  /** 语音识别的录音秒数 */
  asrSeconds: number
  /** 统计起始时间 */
  since: number
  /** 最后一次请求时间 */
  lastAt: number | null
}

const STORAGE_KEY = 'chat-demo:api-usage'

const emptyCalls = (): Record<ApiCallKind, ApiCallStats> =>
  Object.fromEntries(API_CALL_KINDS.map((kind) => [kind, { success: 0, failure: 0 }])) as Record<
    ApiCallKind,
    ApiCallStats
  >

const emptyState = (): ApiUsageState => ({
  calls: emptyCalls(),
  ttsChars: 0,
  asrSeconds: 0,
  since: Date.now(),
  lastAt: null,
})

const readCount = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

const normalize = (value: unknown): ApiUsageState => {
  const source = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rawCalls =
    source.calls !== null && typeof source.calls === 'object'
      ? (source.calls as Record<string, unknown>)
      : {}
  const calls = emptyCalls()
  for (const kind of API_CALL_KINDS) {
    const raw = rawCalls[kind]
    const record =
      raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    calls[kind] = {
      success: readCount(record.success),
      failure: readCount(record.failure),
    }
  }
  return {
    calls,
    ttsChars: readCount(source.ttsChars),
    asrSeconds: readCount(source.asrSeconds),
    since: readCount(source.since) || Date.now(),
    lastAt: readCount(source.lastAt) || null,
  }
}

const load = (): ApiUsageState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? normalize(JSON.parse(saved)) : emptyState()
  } catch {
    return emptyState()
  }
}

const persist = (state: ApiUsageState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储不可用时只保留内存统计
  }
}

export const useApiUsage = create<ApiUsageState>(() => load())

/** 记录一次 API 请求；ok 为 false 表示 HTTP/网络层失败 */
export const recordApiCall = (kind: ApiCallKind, ok: boolean) => {
  useApiUsage.setState((state) => {
    const current = state.calls[kind]
    const next: ApiUsageState = {
      ...state,
      calls: {
        ...state.calls,
        [kind]: {
          success: current.success + (ok ? 1 : 0),
          failure: current.failure + (ok ? 0 : 1),
        },
      },
      lastAt: Date.now(),
    }
    persist(next)
    return next
  })
}

/** 朗读合成字符数：TTS 按文本长度计，便于观察语音用量 */
export const recordTtsChars = (chars: number) => {
  if (!Number.isFinite(chars) || chars <= 0) {
    return
  }
  useApiUsage.setState((state) => {
    const next = { ...state, ttsChars: state.ttsChars + Math.round(chars) }
    persist(next)
    return next
  })
}

/** 语音识别录音时长：只累计秒数，不上传或保存音频 */
export const recordAsrSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return
  }
  useApiUsage.setState((state) => {
    const next = { ...state, asrSeconds: state.asrSeconds + Math.round(seconds) }
    persist(next)
    return next
  })
}

export const resetApiUsage = () => {
  const next = emptyState()
  persist(next)
  useApiUsage.setState(next)
}

export type ApiUsageTotals = {
  total: number
  failures: number
  other: number
  otherFailures: number
}

export const apiUsageTotals = (state: ApiUsageState): ApiUsageTotals => {
  let total = 0
  let failures = 0
  let other = 0
  let otherFailures = 0
  for (const kind of API_CALL_KINDS) {
    const stats = state.calls[kind]
    total += stats.success + stats.failure
    failures += stats.failure
    if (kind !== 'chat') {
      other += stats.success + stats.failure
      otherFailures += stats.failure
    }
  }
  return { total, failures, other, otherFailures }
}

export const apiCallCount = (state: ApiUsageState, kind: ApiCallKind): number => {
  const stats = state.calls[kind]
  return stats.success + stats.failure
}
