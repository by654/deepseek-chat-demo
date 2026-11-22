import { create } from 'zustand'
import { createId } from '../utils/id.js'
import { setApiKey, useSettings } from './settings.js'
import { secureGet, secureSet } from './secureStore.js'

/** 多 API Key：额度隔离、手动切换与失败自动轮换。 */

export type KeyEntry = {
  id: string
  label: string
  key: string
  createdAt: number
  failures: number
}

type KeyState = {
  keys: KeyEntry[]
  activeId: string | null
}

const STORAGE_KEY = 'chat-demo:api-keys'

export const useKeys = create<KeyState>(() => ({ keys: [], activeId: null }))

const persist = (state: KeyState) => {
  void secureSet('api-keys', JSON.stringify(state))
    .then(() => {
      // 加密写入成功后移除旧版明文列表
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // 忽略
      }
    })
    .catch(() => {
      // 加密不可用时回落明文，保证功能可用
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // 忽略存储失败
      }
    })
}

const syncActiveKey = (state: KeyState) => {
  const active = state.keys.find((item) => item.id === state.activeId) ?? state.keys[0]
  const next = { ...state, activeId: active?.id ?? null }
  // 先更新 Key 列表，再同步设置里的 apiKey，避免订阅回调把旧状态写回
  useKeys.setState(next)
  persist(next)
  setApiKey(active?.key ?? null)
}

const parseState = (raw: string | null): KeyState | null => {
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as KeyState).keys)) {
      return parsed as KeyState
    }
  } catch {
    // 损坏的存储按空列表处理
  }
  return null
}

/** 启动时读取加密的 Key 列表；首次升级时迁移旧的明文存储。 */
export const initKeys = async () => {
  let state: KeyState | null = null
  try {
    state = parseState(await secureGet('api-keys'))
  } catch {
    state = null
  }
  if (!state) {
    try {
      state = parseState(localStorage.getItem(STORAGE_KEY))
    } catch {
      state = null
    }
  }
  if (state && state.keys.length > 0) {
    syncActiveKey(state)
    return
  }
  // 空列表时优先接管旧版单 Key，避免升级后丢失 API Key
  const legacy = useSettings.getState().apiKey
  if (legacy) {
    syncActiveKey({
      keys: [{ id: createId(), label: '默认 Key', key: legacy, createdAt: Date.now(), failures: 0 }],
      activeId: null,
    })
    return
  }
  useKeys.setState({ keys: [], activeId: null })
}

/**
 * 数据管理里修改单个 API Key 时同步写回多 Key 列表，避免两处存储分叉；
 * 列表为空时把新 Key 接管为第一条。
 */
useSettings.subscribe((state, previous) => {
  if (state.apiKey === previous.apiKey || !state.apiKey) {
    return
  }
  const current = useKeys.getState()
  if (current.keys.length === 0) {
    syncActiveKey({
      keys: [
        { id: createId(), label: '默认 Key', key: state.apiKey, createdAt: Date.now(), failures: 0 },
      ],
      activeId: null,
    })
    return
  }
  const active = current.keys.find((item) => item.id === current.activeId)
  if (active && active.key !== state.apiKey) {
    const keys = current.keys.map((item) =>
      item.id === active.id ? { ...item, key: state.apiKey as string } : item
    )
    useKeys.setState({ keys, activeId: active.id })
    persist({ keys, activeId: active.id })
  }
})

export const addKey = (key: string, label: string) => {
  const trimmed = key.trim()
  if (!trimmed) {
    return null
  }
  const entry: KeyEntry = {
    id: createId(),
    label: label.trim() || `Key ${useKeys.getState().keys.length + 1}`,
    key: trimmed,
    createdAt: Date.now(),
    failures: 0,
  }
  const state = useKeys.getState()
  syncActiveKey({
    keys: [...state.keys, entry],
    activeId: state.activeId ?? entry.id,
  })
  return entry.id
}

export const removeKey = (id: string) => {
  const state = useKeys.getState()
  const keys = state.keys.filter((item) => item.id !== id)
  syncActiveKey({ keys, activeId: state.activeId === id ? (keys[0]?.id ?? null) : state.activeId })
}

export const activateKey = (id: string) => {
  const state = useKeys.getState()
  if (state.keys.some((item) => item.id === id)) {
    syncActiveKey({ ...state, activeId: id })
  }
}

export const activeKey = () => {
  const state = useKeys.getState()
  return state.keys.find((item) => item.id === state.activeId) ?? null
}

/** 401/402/429 时切到下一条 Key；没有可选 Key 返回 false。 */
export const rotateApiKey = (): boolean => {
  const state = useKeys.getState()
  if (state.keys.length <= 1) {
    const current = state.keys[0]
    if (current) {
      useKeys.setState({
        keys: state.keys.map((item) =>
          item.id === current.id ? { ...item, failures: item.failures + 1 } : item
        ),
      })
    }
    return false
  }
  const currentIndex = Math.max(
    0,
    state.keys.findIndex((item) => item.id === state.activeId)
  )
  const current = state.keys[currentIndex]
  const next = state.keys[(currentIndex + 1) % state.keys.length]
  syncActiveKey({
    keys: state.keys.map((item) =>
      item.id === current?.id ? { ...item, failures: item.failures + 1 } : item
    ),
    activeId: next.id,
  })
  return true
}

export const maskKey = (key: string) => {
  if (key.length <= 8) {
    return '••••'
  }
  return `${key.slice(0, 5)}••••${key.slice(-4)}`
}
