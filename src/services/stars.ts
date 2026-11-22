import { create } from 'zustand'
import { createId } from '../utils/id.js'
import * as db from './chat/db.js'

/** 素材库：跨会话收藏的回答片段。 */
export type StarItem = db.StarRecord

type StarState = {
  ready: boolean
  items: StarItem[]
  error: boolean
}

export const useStars = create<StarState>(() => ({ ready: false, items: [], error: false }))

export const loadStars = async () => {
  try {
    const items = await db.loadStars()
    useStars.setState({ ready: true, items, error: false })
  } catch (error) {
    db.reportStorageError('load stars')(error)
    useStars.setState({ ready: true, error: true })
  }
}

export const starKey = (sessionId: string, messageId: string) => `${sessionId}:${messageId}`

export const isStarred = (sessionId: string, messageId: string) =>
  useStars.getState().items.some((item) => item.id === starKey(sessionId, messageId))

export const toggleStar = async (input: {
  sessionId: string
  messageId: string
  sessionTitle: string
  content: string
  model: string | null
}) => {
  const id = starKey(input.sessionId, input.messageId)
  const existing = useStars.getState().items.find((item) => item.id === id)
  if (existing) {
    await db.deleteStar(id)
    useStars.setState((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    return false
  }
  const star: StarItem = {
    id: id || createId(),
    sessionId: input.sessionId,
    messageId: input.messageId,
    sessionTitle: input.sessionTitle,
    content: input.content,
    model: input.model,
    createdAt: Date.now(),
    tags: [],
  }
  await db.saveStar(star)
  useStars.setState((state) => ({ items: [star, ...state.items] }))
  return true
}

export const updateStarTags = async (id: string, tags: string[]) => {
  const existing = useStars.getState().items.find((item) => item.id === id)
  if (!existing) {
    return
  }
  const next = { ...existing, tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))] }
  await db.saveStar(next)
  useStars.setState((state) => ({
    items: state.items.map((item) => (item.id === id ? next : item)),
  }))
}

export const removeStar = async (id: string) => {
  await db.deleteStar(id)
  useStars.setState((state) => ({ items: state.items.filter((item) => item.id !== id) }))
}
