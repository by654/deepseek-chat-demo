import { useSyncExternalStore } from 'react'
import type { ChatModel } from '../api/types.js'
import { useSettings } from '../settings.js'
import {
  priceOf,
  resolveTier,
  type PriceTier,
  type PricingTable,
  type TierMode,
  type TokenPrice,
} from './pricing.js'

/** auto 模式下每分钟重新判定一次时段，跨时段时无需刷新页面 */
const TICK_MS = 60_000

/**
 * 全局只保留一个定时器：多个组件同时订阅时段时不再各自 setInterval。
 * 快照是「档位字符串」而不是时间戳，同一时段内 tick 不会引起重渲染。
 */
const listeners = new Set<() => void>()
let currentClock = Date.now()
let timer: number | undefined

const tick = () => {
  currentClock = Date.now()
  for (const listener of listeners) {
    listener()
  }
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  if (timer === undefined && typeof window !== 'undefined') {
    timer = window.setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }
}

export const useActiveTier = (): PriceTier => {
  const mode = useSettings((state) => state.pricingTier)
  return useSyncExternalStore(
    subscribe,
    () => resolveTier(mode, new Date(currentClock)),
    () => resolveTier(mode, new Date(currentClock))
  )
}

export const usePricing = (model: ChatModel): { tier: PriceTier; price: TokenPrice } => {
  const tier = useActiveTier()
  const table: PricingTable = useSettings((state) => state.pricingTable)
  return { tier, price: priceOf(table, model, tier) }
}

/** 设置页展示用：档位模式与当前生效档位 */
export const useTierMode = (): { mode: TierMode; tier: PriceTier } => {
  const tier = useActiveTier()
  const mode = useSettings((state) => state.pricingTier)
  return { mode, tier }
}
