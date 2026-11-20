/**
 * 主色令牌派生：由单个主色推出 hover / soft / border / text / glow / ring，
 * 浅色与深色分别使用压暗与提亮的派生规则。运行时以行内 CSS 变量覆盖 theme.css 的默认值，
 * 切换预设或自定义颜色后即时生效并持久化到 localStorage（见 services/settings.ts）。
 */

type Rgb = { r: number; g: number; b: number }

const parseHex = (hex: string): Rgb | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) {
    return null
  }
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((item) => Math.round(item).toString(16).padStart(2, '0')).join('')}`

/** ratio 为第二个颜色的占比 */
const mix = (from: Rgb, to: Rgb, ratio: number): Rgb => ({
  r: from.r + (to.r - from.r) * ratio,
  g: from.g + (to.g - from.g) * ratio,
  b: from.b + (to.b - from.b) * ratio,
})

const rgba = (color: Rgb, alpha: number): string =>
  `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
/** 深色主题的画布底色，用于把主色压成柔和底色 */
const DARK_CANVAS: Rgb = { r: 18, g: 26, b: 28 }

export const DEFAULT_ACCENT = '#2f6b7a'

export type AccentVars = Record<string, string>

/** 由主色派生整套品牌令牌 */
export const deriveAccent = (hex: string, theme: 'light' | 'dark'): AccentVars => {
  const base = parseHex(hex) ?? parseHex(DEFAULT_ACCENT) ?? BLACK
  if (theme === 'light') {
    return {
      '--ui-brand': toHex(base),
      '--ui-brand-hover': toHex(mix(base, BLACK, 0.14)),
      '--ui-brand-soft': toHex(mix(WHITE, base, 0.1)),
      '--ui-brand-soft-hover': toHex(mix(WHITE, base, 0.16)),
      '--ui-brand-border': toHex(mix(WHITE, base, 0.3)),
      '--ui-brand-text': toHex(mix(base, BLACK, 0.12)),
      '--ui-brand-text-strong': toHex(mix(base, BLACK, 0.34)),
      '--ui-on-brand': toHex(WHITE),
      '--ui-brand-glow': rgba(base, 0.16),
      '--ui-ring': rgba(base, 0.32),
    }
  }
  const lifted = mix(base, WHITE, 0.42)
  return {
    '--ui-brand': toHex(lifted),
    '--ui-brand-hover': toHex(mix(base, WHITE, 0.52)),
    '--ui-brand-soft': toHex(mix(DARK_CANVAS, base, 0.3)),
    '--ui-brand-soft-hover': toHex(mix(DARK_CANVAS, base, 0.38)),
    '--ui-brand-border': toHex(mix(DARK_CANVAS, base, 0.45)),
    '--ui-brand-text': toHex(mix(base, WHITE, 0.55)),
    '--ui-brand-text-strong': toHex(mix(base, WHITE, 0.78)),
    '--ui-on-brand': '#0d1416',
    '--ui-brand-glow': rgba(lifted, 0.22),
    '--ui-ring': rgba(lifted, 0.36),
  }
}

const ACCENT_KEYS = Object.keys(deriveAccent(DEFAULT_ACCENT, 'light'))

/** 把派生令牌写到 body 行内样式，同时清掉多余的旧键 */
export const applyAccent = (hex: string, theme: 'light' | 'dark') => {
  const vars = deriveAccent(hex, theme)
  const style = document.body.style
  for (const key of ACCENT_KEYS) {
    const value = vars[key]
    if (value) {
      style.setProperty(key, value)
    } else {
      style.removeProperty(key)
    }
  }
  document.body.dataset.accent = hex.replace('#', '')
}
