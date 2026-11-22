import { create } from 'zustand'

/** 跨会话跳转：命令面板命中消息后，会话页滚动到该消息并短暂高亮。 */
export type JumpRequest = {
  sessionId: string
  messageId: string
  query: string
  /** 每次请求递增，便于同一消息重复跳转。 */
  token: number
}

type JumpState = {
  request: JumpRequest | null
  clear: () => void
}

let token = 0

export const useJump = create<JumpState>((set) => ({
  request: null,
  clear: () => set({ request: null }),
}))

export const requestJump = (sessionId: string, messageId: string, query: string) => {
  token += 1
  useJump.setState({ request: { sessionId, messageId, query, token } })
}
