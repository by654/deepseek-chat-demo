import { useSyncExternalStore } from 'react'
import { useSettings, type ThemePreference } from '../services/settings.js'
import { applyAccent, DEFAULT_ACCENT } from './accent.js'
import { CUSTOM_PRESET_ID, presetBrand } from './presets.js'

export type Theme = 'light' | 'dark'

const query = window.matchMedia('(prefers-color-scheme: dark)')

const subscribeOsTheme = (listener: () => void) => {
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

const getOsTheme = (): Theme => (query.matches ? 'dark' : 'light')

const resolveTheme = (preference: ThemePreference, osTheme: Theme): Theme =>
  preference === 'system' ? osTheme : preference

/** 当前实际生效的深浅色：手动选择优先，「跟随系统」时取系统设置 */
export const useTheme = (): Theme => {
  const preference = useSettings((state) => state.themePreference)
  const osTheme = useSyncExternalStore(subscribeOsTheme, getOsTheme)
  return resolveTheme(preference, osTheme)
}

const syncPageBackground = () => {
  const backgroundColor = getComputedStyle(document.body).backgroundColor
  document.documentElement.style.backgroundColor = backgroundColor
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', backgroundColor)
}

/** 同步页面主题、根画布背景和支持 theme-color 的浏览器栏。 */
const applyTheme = (theme: Theme) => {
  const body = document.body
  // 主题切换帧禁用过渡，使页面颜色同步更新
  body.classList.add('change-theme')
  body.classList.toggle('dark', theme === 'dark')
  body.classList.toggle('light', theme === 'light')
  if (theme === 'dark') {
    body.setAttribute('data-ds-dark-theme', 'dark')
  } else {
    body.removeAttribute('data-ds-dark-theme')
  }
  document.documentElement.style.colorScheme = theme
  // 首次背景色同步在样式表加载完成后执行，适配 WebKit 的 defer 脚本执行顺序。
  if (document.readyState === 'complete') {
    syncPageBackground()
  }
  setTimeout(() => {
    body.classList.remove('change-theme')
  }, 0)
}

let appliedTheme: Theme | null = null
/** 已应用的主色与深浅色组合，避免重复写行内变量 */
let appliedAccent = ''

const currentAccent = (): string => {
  const { themePreset, customBrand } = useSettings.getState()
  if (themePreset === CUSTOM_PRESET_ID) {
    return customBrand ?? DEFAULT_ACCENT
  }
  return presetBrand(themePreset)
}

/** 主色切换（预设或自定义）立即生效：深浅色不同，两者都变化时才重新写入 */
const syncAccent = (theme: Theme) => {
  const hex = currentAccent()
  const key = `${hex}|${theme}`
  if (key === appliedAccent) {
    return
  }
  appliedAccent = key
  applyAccent(hex, theme)
}

let appliedStyle: string | null = null

/** 界面风格只切换中性色令牌，不改动明暗偏好与主色 */
const syncStyle = () => {
  const { themeStyle } = useSettings.getState()
  if (themeStyle !== appliedStyle) {
    appliedStyle = themeStyle
    document.body.dataset.themeStyle = themeStyle
  }
}

const syncTheme = () => {
  const theme = resolveTheme(useSettings.getState().themePreference, getOsTheme())
  if (theme !== appliedTheme) {
    appliedTheme = theme
    applyTheme(theme)
  }
  syncStyle()
  syncAccent(theme)
}

/** 首屏渲染前同步应用一次，之后随主题设置与系统深浅色变化更新 */
export const setupTheme = () => {
  syncTheme()
  if (document.readyState !== 'complete') {
    window.addEventListener('load', syncPageBackground, { once: true })
  }
  query.addEventListener('change', syncTheme)
  useSettings.subscribe(syncTheme)
}
