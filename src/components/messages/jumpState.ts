import { useSyncExternalStore } from 'react'

/** 是否已远离底部（由消息列表在滚动时写入，供向下箭头按钮订阅） */
let away = false
/** 消息列表注册的滚动到底部实现 */
let jump: (() => void) | null = null
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

export const setAwayFromBottom = (value: boolean) => {
  if (value === away) {
    return
  }
  away = value
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => away

export const useAwayFromBottom = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

/** 消息列表挂载时注册，卸载时注销（同时清掉远离底部的状态，避免切会话后残留） */
export const registerJumpToBottom = (fn: () => void) => {
  jump = fn
  return () => {
    if (jump === fn) {
      jump = null
    }
    setAwayFromBottom(false)
  }
}

export const requestJumpToBottom = () => {
  jump?.()
}
