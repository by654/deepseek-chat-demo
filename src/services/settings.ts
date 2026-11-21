import { create } from 'zustand'
import type { ChatModel } from './api/types.js'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'
import {
  normalizePricingTable,
  OFFICIAL_PRICING,
  type PriceTier,
  type PricingTable,
  type TierMode,
  type TokenPrice,
} from './usage/pricing.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 界面风格：只替换中性色板，主色仍由配色预设控制 */
export type ThemeStyle = 'official' | 'slate' | 'warm' | 'graphite'

/** 排队策略：保留多条依次执行 / 只保留最后一条 */
export type QueueMode = 'keep' | 'last'

/** 重启后恢复上次会话的行为 */
export type RestoreMode = 'ask' | 'always' | 'off'

/** 本机设置，存 localStorage：API Key、语言、主题与配色、位置、朗读音色、开关、用量单价与余额刷新 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  /** 界面风格：官方蓝白 / 青灰 / 暖砂 / 石墨 */
  themeStyle: ThemeStyle
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 配色预设 ID；custom 表示使用自定义主色 */
  themePreset: string
  /** 自定义主色 #rrggbb */
  customBrand: string | null
  /** 各模型在闲时/高峰两档下的官方单价（元 / 百万 token），可在设置中修改 */
  pricingTable: PricingTable
  /** 计价档位：auto 按当前北京时间自动选档，offpeak/peak 为手动锁定 */
  pricingTier: TierMode
  /** 上下文窗口容量，用于计算剩余额度 */
  contextWindow: number
  /** 余额自动刷新间隔（分钟），0 表示关闭 */
  balanceRefreshMinutes: number
  /** 消息排队：流式输出期间允许继续输入并自动排队发送 */
  queueEnabled: boolean
  /** 排队策略：keep 保留多条依次执行；last 只保留最后一条 */
  queueMode: QueueMode
  /** 自定义系统提示词，每次发言都会带上 */
  systemPrompt: string
  /** 新对话首次发言附加内容，仅在该对话第一条消息发送时加入 */
  firstTurnPrompt: string
  /** 界面字体缩放（百分比），分别用于正文、代码块、思考过程 */
  fontText: number
  fontCode: number
  fontThinking: number
  /** 重启后是否恢复上次会话：ask 每次询问 / always 直接打开 / off 不处理 */
  restoreMode: RestoreMode
  /** 淡化输出：回答内容渐显而非整段硬切 */
  fadeOutput: boolean
  /** 回答下方「导出文档」按钮开关 */
  wordExportEnabled: boolean
  /** 导出 Word 的字体、字号（磅）与文字颜色 */
  wordFontFamily: string
  wordFontSize: number
  wordColor: string
  /** 首次引导是否已完成 */
  onboardingDone: boolean
  /** 引导页填写的称呼，用于界面问候 */
  nickname: string
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  themeStyle: 'chat-demo:theme-style',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  themePreset: 'chat-demo:theme-preset',
  customBrand: 'chat-demo:custom-brand',
  pricingTable: 'chat-demo:pricing-table',
  pricingTier: 'chat-demo:pricing-tier',
  contextWindow: 'chat-demo:context-window',
  balanceRefreshMinutes: 'chat-demo:balance-refresh-minutes',
  queueEnabled: 'chat-demo:queue-enabled',
  queueMode: 'chat-demo:queue-mode',
  systemPrompt: 'chat-demo:system-prompt',
  firstTurnPrompt: 'chat-demo:first-turn-prompt',
  fontText: 'chat-demo:font-text',
  fontCode: 'chat-demo:font-code',
  fontThinking: 'chat-demo:font-thinking',
  restoreMode: 'chat-demo:restore-mode',
  fadeOutput: 'chat-demo:fade-output',
  wordExportEnabled: 'chat-demo:word-export-enabled',
  wordFontFamily: 'chat-demo:word-font-family',
  wordFontSize: 'chat-demo:word-font-size',
  wordColor: 'chat-demo:word-color',
  onboardingDone: 'chat-demo:onboarding-done',
  nickname: 'chat-demo:nickname',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用贴近 DeepSeek 官方聊天的蓝白风格 */
const initialThemeStyle = (): ThemeStyle => {
  const saved = read(KEYS.themeStyle)
  return saved === 'slate' || saved === 'warm' || saved === 'graphite' ? saved : 'official'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** 未保存过时使用官方蓝，配合默认的官方蓝白风格 */
const initialThemePreset = (): string => read(KEYS.themePreset) ?? 'official'

const initialCustomBrand = (): string | null => {
  const saved = read(KEYS.customBrand)
  return saved && HEX_COLOR.test(saved) ? saved.toLowerCase() : null
}

const initialNumber = (key: string, fallback: number): number => {
  const saved = read(key)
  if (saved === null) {
    return fallback
  }
  const parsed = Number(saved)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 未保存过时预填官方单价；已保存时逐字段合并，缺项回落官方值 */
const initialPricingTable = (): PricingTable => {
  const saved = read(KEYS.pricingTable)
  if (!saved) {
    return OFFICIAL_PRICING
  }
  try {
    return normalizePricingTable(JSON.parse(saved))
  } catch {
    return OFFICIAL_PRICING
  }
}

const initialPricingTier = (): TierMode => {
  const saved = read(KEYS.pricingTier)
  return saved === 'offpeak' || saved === 'peak' ? saved : 'auto'
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  themeStyle: initialThemeStyle(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  themePreset: initialThemePreset(),
  customBrand: initialCustomBrand(),
  pricingTable: initialPricingTable(),
  pricingTier: initialPricingTier(),
  contextWindow: initialNumber(KEYS.contextWindow, 128_000),
  balanceRefreshMinutes: initialNumber(KEYS.balanceRefreshMinutes, 0),
  queueEnabled: read(KEYS.queueEnabled) !== 'false',
  queueMode: read(KEYS.queueMode) === 'last' ? 'last' : 'keep',
  systemPrompt: read(KEYS.systemPrompt) ?? '',
  firstTurnPrompt: read(KEYS.firstTurnPrompt) ?? '',
  fontText: initialNumber(KEYS.fontText, 100),
  fontCode: initialNumber(KEYS.fontCode, 100),
  fontThinking: initialNumber(KEYS.fontThinking, 100),
  restoreMode: (() => {
    const saved = read(KEYS.restoreMode)
    return saved === 'always' || saved === 'off' ? saved : 'ask'
  })(),
  fadeOutput: read(KEYS.fadeOutput) !== 'false',
  wordExportEnabled: read(KEYS.wordExportEnabled) !== 'false',
  wordFontFamily: read(KEYS.wordFontFamily) ?? 'default',
  wordFontSize: initialNumber(KEYS.wordFontSize, 12),
  wordColor: read(KEYS.wordColor) ?? '#1a1a1a',
  onboardingDone: read(KEYS.onboardingDone) === 'true',
  nickname: read(KEYS.nickname) ?? '',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setThemeStyle = (themeStyle: ThemeStyle) => {
  write(KEYS.themeStyle, themeStyle)
  useSettings.setState({ themeStyle })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

/** 配色预设：切换后立即生效并持久化 */
export const setThemePreset = (themePreset: string) => {
  write(KEYS.themePreset, themePreset)
  useSettings.setState({ themePreset })
}

/** 自定义主色：传 null 清空，仅在选择 custom 预设时生效 */
export const setCustomBrand = (customBrand: string | null) => {
  const normalized = customBrand && HEX_COLOR.test(customBrand) ? customBrand.toLowerCase() : null
  write(KEYS.customBrand, normalized)
  useSettings.setState({ customBrand: normalized })
}

/** 修改某个模型某一档位下的一项单价；传 null 表示回落官方单价 */
export const setPricingValue = (
  model: ChatModel,
  tier: PriceTier,
  field: keyof TokenPrice,
  value: number | null
) => {
  const current = useSettings.getState().pricingTable
  const next = normalizePricingTable({
    ...current,
    [model]: {
      ...current[model],
      [tier]: {
        ...current[model][tier],
        [field]: value === null ? OFFICIAL_PRICING[model][tier][field] : value,
      },
    },
  })
  write(KEYS.pricingTable, JSON.stringify(next))
  useSettings.setState({ pricingTable: next })
}

/** 一键恢复官方单价 */
export const resetPricingTable = () => {
  write(KEYS.pricingTable, JSON.stringify(OFFICIAL_PRICING))
  useSettings.setState({ pricingTable: OFFICIAL_PRICING })
}

export const setPricingTier = (pricingTier: TierMode) => {
  write(KEYS.pricingTier, pricingTier)
  useSettings.setState({ pricingTier })
}

export const setContextWindow = (contextWindow: number) => {
  write(KEYS.contextWindow, String(contextWindow))
  useSettings.setState({ contextWindow })
}

export const setBalanceRefreshMinutes = (balanceRefreshMinutes: number) => {
  write(KEYS.balanceRefreshMinutes, String(balanceRefreshMinutes))
  useSettings.setState({ balanceRefreshMinutes })
}

export const setQueueEnabled = (queueEnabled: boolean) => {
  write(KEYS.queueEnabled, String(queueEnabled))
  useSettings.setState({ queueEnabled })
}

export const setQueueMode = (queueMode: QueueMode) => {
  write(KEYS.queueMode, queueMode)
  useSettings.setState({ queueMode })
}

export const setSystemPrompt = (systemPrompt: string) => {
  write(KEYS.systemPrompt, systemPrompt)
  useSettings.setState({ systemPrompt })
}

export const setFirstTurnPrompt = (firstTurnPrompt: string) => {
  write(KEYS.firstTurnPrompt, firstTurnPrompt)
  useSettings.setState({ firstTurnPrompt })
}

/** 字体缩放取值范围统一收口在 60%~200% */
const clampScale = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(200, Math.max(60, Math.round(value)))
}

export const setFontText = (fontText: number) => {
  const value = clampScale(fontText, 100)
  write(KEYS.fontText, String(value))
  useSettings.setState({ fontText: value })
}

export const setFontCode = (fontCode: number) => {
  const value = clampScale(fontCode, 100)
  write(KEYS.fontCode, String(value))
  useSettings.setState({ fontCode: value })
}

export const setFontThinking = (fontThinking: number) => {
  const value = clampScale(fontThinking, 100)
  write(KEYS.fontThinking, String(value))
  useSettings.setState({ fontThinking: value })
}

export const setRestoreMode = (restoreMode: RestoreMode) => {
  write(KEYS.restoreMode, restoreMode)
  useSettings.setState({ restoreMode })
}

export const setFadeOutput = (fadeOutput: boolean) => {
  write(KEYS.fadeOutput, String(fadeOutput))
  useSettings.setState({ fadeOutput })
}

export const setWordExportEnabled = (wordExportEnabled: boolean) => {
  write(KEYS.wordExportEnabled, String(wordExportEnabled))
  useSettings.setState({ wordExportEnabled })
}

export const setWordFontFamily = (wordFontFamily: string) => {
  write(KEYS.wordFontFamily, wordFontFamily)
  useSettings.setState({ wordFontFamily })
}

export const setWordFontSize = (wordFontSize: number) => {
  const value = Number.isFinite(wordFontSize) ? Math.min(32, Math.max(8, wordFontSize)) : 12
  write(KEYS.wordFontSize, String(value))
  useSettings.setState({ wordFontSize: value })
}

export const setWordColor = (wordColor: string) => {
  const value = HEX_COLOR.test(wordColor) ? wordColor.toLowerCase() : '#1a1a1a'
  write(KEYS.wordColor, value)
  useSettings.setState({ wordColor: value })
}

export const setOnboardingDone = (onboardingDone: boolean) => {
  write(KEYS.onboardingDone, String(onboardingDone))
  useSettings.setState({ onboardingDone })
}

export const setNickname = (nickname: string) => {
  write(KEYS.nickname, nickname)
  useSettings.setState({ nickname })
}

/**
 * 把字体缩放写入根元素的 CSS 变量，样式层统一用 calc(基础值 * var(--ds-font-scale-*)) 消费。
 * 数值以百分比形式传入，保持 CSS 可读性。
 */
export const applyFontScale = () => {
  if (typeof document === 'undefined') {
    return
  }
  const { fontText, fontCode, fontThinking } = useSettings.getState()
  const root = document.documentElement.style
  root.setProperty('--ds-font-scale-text', `${fontText}%`)
  root.setProperty('--ds-font-scale-code', `${fontCode}%`)
  root.setProperty('--ds-font-scale-thinking', `${fontThinking}%`)
}
