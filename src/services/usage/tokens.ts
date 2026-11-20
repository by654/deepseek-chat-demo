import type { MessageUsage } from '../api/types.js'
import type { AssistantMessage } from '../chat/types.js'

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

/** 整个会话累计的输入与输出 token */
export const sessionTokens = (
  messages: readonly { role: string; usage?: MessageUsage }[]
): { input: number; output: number; total: number } => {
  let input = 0
  let output = 0
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) {
      continue
    }
    input += billableInput(message.usage)
    output += message.usage.output_tokens
  }
  return { input, output, total: input + output }
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
