import type { MessageUsage } from '../api/types.js'
import type { AssistantMessage } from '../chat/types.js'
import { tokenBreakdown, type TokenBreakdown } from './pricing.js'

/** 计入账单的输入 token：常规输入 + 缓存写入 + 缓存命中 */
export const billableInput = (usage: MessageUsage): number =>
  usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens

/** 单条回答本轮消耗：输入（含缓存）与输出 */
export const roundTokens = (usage: MessageUsage) => ({
  input: billableInput(usage),
  output: usage.output_tokens,
})

/** 单条回答占用的上下文长度：输入 + 输出 */
export const contextTokens = (usage: MessageUsage): number =>
  billableInput(usage) + usage.output_tokens

/** 整个会话累计的用量：输入/输出/总计，并区分缓存命中与未命中 */
export const sessionTokens = (
  messages: readonly { role: string; usage?: MessageUsage }[]
): TokenBreakdown => {
  const total: TokenBreakdown = {
    cacheHit: 0,
    cacheMiss: 0,
    input: 0,
    output: 0,
    total: 0,
  }
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) {
      continue
    }
    const round = tokenBreakdown(message.usage)
    total.cacheHit += round.cacheHit
    total.cacheMiss += round.cacheMiss
    total.input += round.input
    total.output += round.output
    total.total += round.total
  }
  return total
}

/** 最近一条带用量的回答占用的上下文长度，作为当前上下文水位 */
export const latestContextTokens = (messages: readonly AssistantMessage[]): number | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const usage = messages[index].usage
    if (usage) {
      return contextTokens(usage)
    }
  }
  return null
}

/** 粗略 token 估算：CJK 每字约 1 token，其他字符约 0.3 token；用于发送前阈值与上下文裁剪。 */
export const estimateTokens = (text: string): number => {
  let cjk = 0
  let other = 0
  for (const char of text) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(char)) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return Math.ceil(cjk + other * 0.3)
}

/** 令牌数展示：超过一万用 k 缩写，保留一位小数 */
export const formatTokens = (value: number): string => {
  if (value < 1000) {
    return String(value)
  }
  if (value < 10_000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1000)}k`
  }
  return `${(value / 1_000_000).toFixed(2)}M`
}
