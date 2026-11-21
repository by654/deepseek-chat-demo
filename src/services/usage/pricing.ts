import type { ChatModel, MessageUsage } from '../api/types.js'

/**
 * 官方计价口径：元 / 百万 token。
 * 高峰时段为北京时间周一至周五 9:00-12:00 与 14:00-18:00（法定节假日除外），其余为闲时。
 */
export type PriceTier = 'offpeak' | 'peak'

/** auto 表示按当前北京时间自动选档，其余为手动锁定 */
export type TierMode = 'auto' | PriceTier

/** 三类计价 token 的单价 */
export type TokenPrice = {
  /** 缓存命中输入 */
  cacheHit: number
  /** 缓存未命中输入（含缓存写入） */
  cacheMiss: number
  /** 输出 */
  output: number
}

export type PricingTable = Record<ChatModel, Record<PriceTier, TokenPrice>>

export const MODEL_ORDER: readonly ChatModel[] = ['deepseek-flash', 'deepseek-v4-pro']

/** 官方单价，作为默认值预填到设置中 */
export const OFFICIAL_PRICING: PricingTable = {
  'deepseek-flash': {
    offpeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  },
  'deepseek-v4-pro': {
    offpeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
  },
}

export const DEFAULT_CONTEXT_WINDOW = 128_000
export const MIN_CONTEXT_WINDOW = 4_000
export const MAX_CONTEXT_WINDOW = 2_000_000

/**
 * 中国法定节假日（含调休放假、不含调休上班），按北京时间日期区间维护。
 * 数据来源：国务院办公厅关于 2026 年部分节假日安排的通知。新年份发布后在此追加即可。
 */
const HOLIDAY_RANGES: readonly (readonly [string, string])[] = [
  ['2026-01-01', '2026-01-03'],
  ['2026-02-15', '2026-02-23'],
  ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'],
  ['2026-06-19', '2026-06-21'],
  ['2026-09-25', '2026-09-27'],
  ['2026-10-01', '2026-10-07'],
]

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const PEAK_RANGES: readonly (readonly [number, number])[] = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
]

const pad = (value: number) => String(value).padStart(2, '0')

/** 取北京时间的日期文本、星期（0 为周日）与当日分钟数 */
const beijingClock = (at: Date) => {
  const shifted = new Date(at.getTime() + BEIJING_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth() + 1
  const day = shifted.getUTCDate()
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

const isHoliday = (date: string): boolean =>
  HOLIDAY_RANGES.some(([begin, end]) => date >= begin && date <= end)

/** 是否处于高峰时段（北京时间工作日 9:00-12:00、14:00-18:00，法定节假日除外） */
export const isPeakTime = (at: Date = new Date()): boolean => {
  const { date, weekday, minutes } = beijingClock(at)
  if (weekday === 0 || weekday === 6 || isHoliday(date)) {
    return false
  }
  return PEAK_RANGES.some(([begin, end]) => minutes >= begin && minutes < end)
}

/** 按设置项与当前时间确定实际使用的档位 */
export const resolveTier = (mode: TierMode, at: Date = new Date()): PriceTier =>
  mode === 'auto' ? (isPeakTime(at) ? 'peak' : 'offpeak') : mode

/** 读取某个模型在指定档位下的单价，缺失时回落官方单价 */
export const priceOf = (table: PricingTable, model: ChatModel, tier: PriceTier): TokenPrice =>
  table[model]?.[tier] ?? OFFICIAL_PRICING[model][tier]

export const isPriced = (price: TokenPrice): boolean =>
  Number.isFinite(price.cacheHit) && Number.isFinite(price.cacheMiss) && Number.isFinite(price.output)

/** 把任意外部数据（本地存储 / 旧版本）归一为完整价目表，逐字段回落官方单价 */
export const normalizePricingTable = (value: unknown): PricingTable => {
  const source = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const readModel = (model: ChatModel) => {
    const rawModel = source[model]
    const modelRecord =
      rawModel !== null && typeof rawModel === 'object' ? (rawModel as Record<string, unknown>) : {}
    const readTier = (tier: PriceTier): TokenPrice => {
      const rawTier = modelRecord[tier]
      const tierRecord =
        rawTier !== null && typeof rawTier === 'object' ? (rawTier as Record<string, unknown>) : {}
      const pick = (key: keyof TokenPrice) => {
        const parsed = Number(tierRecord[key])
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : OFFICIAL_PRICING[model][tier][key]
      }
      return { cacheHit: pick('cacheHit'), cacheMiss: pick('cacheMiss'), output: pick('output') }
    }
    return { offpeak: readTier('offpeak'), peak: readTier('peak') }
  }
  return {
    'deepseek-flash': readModel('deepseek-flash'),
    'deepseek-v4-pro': readModel('deepseek-v4-pro'),
  }
}

/** 三类 token 数量：缓存命中、缓存未命中、输出 */
export type TokenBreakdown = {
  cacheHit: number
  cacheMiss: number
  input: number
  output: number
  total: number
}

export const tokenBreakdown = (usage: MessageUsage): TokenBreakdown => {
  const cacheHit = usage.cache_read_input_tokens
  const cacheMiss = usage.input_tokens + usage.cache_creation_input_tokens
  const input = cacheHit + cacheMiss
  const output = usage.output_tokens
  return { cacheHit, cacheMiss, input, output, total: input + output }
}

/** 三类 token 各自的费用与合计 */
export type CostBreakdown = {
  cacheHit: number
  cacheMiss: number
  output: number
  total: number
}

export const costFromTokens = (tokens: TokenBreakdown, price: TokenPrice): CostBreakdown => {
  const cacheHit = (tokens.cacheHit / 1_000_000) * price.cacheHit
  const cacheMiss = (tokens.cacheMiss / 1_000_000) * price.cacheMiss
  const output = (tokens.output / 1_000_000) * price.output
  return { cacheHit, cacheMiss, output, total: cacheHit + cacheMiss + output }
}

export const costBreakdown = (usage: MessageUsage, price: TokenPrice): CostBreakdown =>
  costFromTokens(tokenBreakdown(usage), price)

export const estimateCost = (usage: MessageUsage, price: TokenPrice): number =>
  costBreakdown(usage, price).total

/** 0 元显示 ¥0；不足 0.01 元保留四位小数，避免小额被四舍五入成 0 */
export const formatCost = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '¥0'
  }
  if (value < 0.01) {
    return `¥${value.toFixed(4)}`
  }
  return `¥${value.toFixed(2)}`
}

/** 单价输入：空串或非法值返回 null，表示回落到官方单价 */
export const parsePrice = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export const parseContextWindow = (value: string): number | null => {
  const parsed = Number(value.trim().replace(/[_\s,]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return Math.min(MAX_CONTEXT_WINDOW, Math.max(MIN_CONTEXT_WINDOW, Math.round(parsed)))
}
