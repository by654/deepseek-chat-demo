import type { MessageUsage } from '../api/types.js'
import { billableInput } from './tokens.js'

/** 单价配置：单位「元 / 百万 token」，null 表示尚未配置 */
export type Pricing = {
  input: number | null
  output: number | null
}

/** 上下文窗口默认值，可在设置中调整 */
export const DEFAULT_CONTEXT_WINDOW = 128_000
export const MIN_CONTEXT_WINDOW = 4_000
export const MAX_CONTEXT_WINDOW = 2_000_000

export const isPriced = (pricing: Pricing): boolean =>
  pricing.input !== null && pricing.output !== null

/**
 * 估算本轮费用：输入按百万 token 单价计（含缓存写入与命中），输出同理。
 * 任一单价未配置时返回 null，由界面展示为「待配置」，不猜测价格。
 */
export const estimateCost = (usage: MessageUsage, pricing: Pricing): number | null => {
  if (pricing.input === null || pricing.output === null) {
    return null
  }
  return (billableInput(usage) / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output
}

/** 费用文案：小额保留 4 位小数，避免长时间显示 0.00 */
export const formatCost = (value: number): string => {
  if (value === 0) {
    return '¥0'
  }
  if (value < 0.01) {
    return `¥${value.toFixed(4)}`
  }
  return `¥${value.toFixed(2)}`
}

/** 解析设置中输入的单价：空串或非法值视为未配置 */
export const parsePrice = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** 解析上下文窗口：越界时夹到允许区间 */
export const parseContextWindow = (value: string): number | null => {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return Math.min(MAX_CONTEXT_WINDOW, Math.max(MIN_CONTEXT_WINDOW, Math.round(parsed)))
}
