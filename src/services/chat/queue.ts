import { create } from 'zustand'
import { createId } from '../../utils/id.js'
import type { QueueMode } from '../settings.js'

export type { QueueMode }

export type QueuedMessage = {
  id: string
  /** 入队时的目标会话，null 表示当时还没有会话（新对话首条） */
  sessionId: string | null
  text: string
  createdAt: number
}

type QueueState = { items: QueuedMessage[] }

/**
 * 待发消息队列。只存在于内存：刷新页面即清空，避免把未发出的内容误当成已发送记录。
 * 队列按入队顺序保存，取用时由发送方调用 shiftQueue 逐条消费。
 */
export const useMessageQueue = create<QueueState>(() => ({ items: [] }))

const belongsTo = (item: QueuedMessage, sessionId: string | null): boolean => {
  if (sessionId === null) {
    // 新对话队列项：sessionId 为 null 的都算，一旦会话已建立则不再匹配
    return item.sessionId === null
  }
  return item.sessionId === sessionId
}

export const enqueueMessage = (
  sessionId: string | null,
  text: string,
  mode: QueueMode
): QueuedMessage => {
  const item: QueuedMessage = {
    id: createId(),
    sessionId,
    text,
    createdAt: Date.now(),
  }
  useMessageQueue.setState((state) => {
    if (mode === 'last') {
      // 只保留最后一条：同一会话之前的排队项全部丢弃
      return { items: [...state.items.filter((it) => !belongsTo(it, sessionId)), item] }
    }
    return { items: [...state.items, item] }
  })
  return item
}

export const updateQueuedText = (id: string, text: string) => {
  useMessageQueue.setState((state) => ({
    items: state.items.map((item) => (item.id === id ? { ...item, text } : item)),
  }))
}

export const removeQueuedMessage = (id: string) => {
  useMessageQueue.setState((state) => ({ items: state.items.filter((item) => item.id !== id) }))
}

/** 取走并移除该会话的队首项；没有排队时返回 null */
export const shiftQueue = (sessionId: string | null): QueuedMessage | null => {
  const { items } = useMessageQueue.getState()
  const next = items.find((item) => belongsTo(item, sessionId))
  if (!next) {
    return null
  }
  useMessageQueue.setState({ items: items.filter((item) => item.id !== next.id) })
  return next
}

/** 会话建立后把队首项的目标会话从 null 改成真实会话 ID */
export const adoptQueue = (from: string | null, to: string) => {
  useMessageQueue.setState((state) => ({
    items: state.items.map((item) =>
      belongsTo(item, from) ? { ...item, sessionId: to } : item
    ),
  }))
}

export const clearQueue = (sessionId?: string | null) => {
  if (sessionId === undefined) {
    useMessageQueue.setState({ items: [] })
    return
  }
  useMessageQueue.setState((state) => ({
    items: state.items.filter((item) => !belongsTo(item, sessionId)),
  }))
}

export const getQueue = (sessionId: string | null): QueuedMessage[] =>
  useMessageQueue.getState().items.filter((item) => belongsTo(item, sessionId))
