import * as db from './chat/db.js'
import { getVisibleMessages } from './chat/branches.js'
import { useSettings } from './settings.js'
import { costFromTokens, priceOf, resolveTier, tokenBreakdown, type TokenBreakdown } from './usage/pricing.js'
import { MODEL_ORDER } from './usage/pricing.js'
import type { ChatModel } from './api/types.js'

/** 用量报表：按模型与月份聚合 token、费用和重试次数。 */

export type ModelStat = {
  model: ChatModel
  calls: number
  tokens: TokenBreakdown
  cost: number
  avgCost: number
  retries: number
}

export type MonthStat = {
  month: string
  cost: number
  calls: number
  tokens: number
}

export type UsageReport = {
  models: ModelStat[]
  months: MonthStat[]
  totalCost: number
  totalCalls: number
  currentMonthCost: number
}

const monthKey = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export const loadUsageReport = async (): Promise<UsageReport> => {
  const sessions = await db.loadAllSessions()
  const settings = useSettings.getState()
  const tier = resolveTier(settings.pricingTier)
  const models = new Map<ChatModel, ModelStat>()
  const months = new Map<string, MonthStat>()
  const now = new Date()
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(date.getTime())
    months.set(key, { month: key, cost: 0, calls: 0, tokens: 0 })
  }
  let totalCost = 0
  let totalCalls = 0
  for (const session of sessions) {
    if (session.deletedAt !== undefined) {
      continue
    }
    const messages = getVisibleMessages(session)
    const siblingCount = new Map<string | null | undefined, number>()
    for (const message of session.messages) {
      if (message.role === 'assistant') {
        siblingCount.set(message.parentId, (siblingCount.get(message.parentId) ?? 0) + 1)
      }
    }
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.usage) {
        continue
      }
      const model = message.model ?? 'deepseek-flash'
      const tokens = tokenBreakdown(message.usage)
      const price = priceOf(settings.pricingTable, model, tier)
      const cost = costFromTokens(tokens, price).total
      const stat =
        models.get(model) ??
        ({
          model,
          calls: 0,
          tokens: { cacheHit: 0, cacheMiss: 0, input: 0, output: 0, total: 0 },
          cost: 0,
          avgCost: 0,
          retries: 0,
        } satisfies ModelStat)
      stat.calls += 1
      stat.cost += cost
      stat.tokens.cacheHit += tokens.cacheHit
      stat.tokens.cacheMiss += tokens.cacheMiss
      stat.tokens.input += tokens.input
      stat.tokens.output += tokens.output
      stat.tokens.total += tokens.total
      stat.retries += (siblingCount.get(message.parentId) ?? 1) > 1 ? 1 : 0
      models.set(model, stat)
      totalCost += cost
      totalCalls += 1
      const key = monthKey(message.createdAt)
      const month = months.get(key)
      if (month) {
        month.cost += cost
        month.calls += 1
        month.tokens += tokens.total
      }
    }
  }
  for (const stat of models.values()) {
    stat.avgCost = stat.calls > 0 ? stat.cost / stat.calls : 0
  }
  const modelList = MODEL_ORDER.map((model) => models.get(model)).filter(
    (stat): stat is ModelStat => stat !== undefined && stat.calls > 0
  )
  return {
    models: modelList,
    months: [...months.values()],
    totalCost,
    totalCalls,
    currentMonthCost: months.get(monthKey(Date.now()))?.cost ?? 0,
  }
}
