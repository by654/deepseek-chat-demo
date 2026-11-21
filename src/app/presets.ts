import { DEFAULT_ACCENT } from './accent.js'

/** 配色预设：主色由 accent.ts 派生为整套品牌令牌 */
export type AccentPreset = {
  id: string
  /** 预设展示名，使用 i18n key 由组件翻译 */
  label: string
  brand: string
}

export const accentPresets: AccentPreset[] = [
  { id: 'default', label: 'accentPresetDefault', brand: DEFAULT_ACCENT },
  { id: 'ocean', label: 'accentPresetOcean', brand: '#2b6fa8' },
  { id: 'forest', label: 'accentPresetForest', brand: '#2f7a55' },
  { id: 'violet', label: 'accentPresetViolet', brand: '#6b4fa8' },
  { id: 'amber', label: 'accentPresetAmber', brand: '#9a6a1f' },
  { id: 'rose', label: 'accentPresetRose', brand: '#a8446b' },
  { id: 'graphite', label: 'accentPresetGraphite', brand: '#4a5560' },
  { id: 'official', label: 'accentPresetOfficial', brand: '#4d6bfe' },
  { id: 'sky', label: 'accentPresetSky', brand: '#1e7bd8' },
  { id: 'teal', label: 'accentPresetTeal', brand: '#0f8a8a' },
  { id: 'indigo', label: 'accentPresetIndigo', brand: '#4b3fb5' },
  { id: 'crimson', label: 'accentPresetCrimson', brand: '#b03a4a' },
  { id: 'mint', label: 'accentPresetMint', brand: '#2e9e7a' },
]

export const CUSTOM_PRESET_ID = 'custom'

/** 未匹配到预设时回落到默认主色 */
export const presetBrand = (id: string): string =>
  accentPresets.find((preset) => preset.id === id)?.brand ?? DEFAULT_ACCENT

/**
 * 界面风格：只负责中性色板与明暗层次，主色仍由上面的配色预设控制。
 * swatches 仅用于设置页的即时预览，实际色值在 theme.css 中维护。
 */
export type ThemeStylePreset = {
  id: 'official' | 'slate' | 'warm' | 'graphite'
  label: string
  hint: string
  swatches: [string, string, string]
}

export const themeStylePresets: ThemeStylePreset[] = [
  {
    id: 'official',
    label: 'themeStyleOfficial',
    hint: 'themeStyleOfficialHint',
    swatches: ['#f8faff', '#ffffff', '#4d6bfe'],
  },
  {
    id: 'slate',
    label: 'themeStyleSlate',
    hint: 'themeStyleSlateHint',
    swatches: ['#f7f9fa', '#ffffff', '#2f6b7a'],
  },
  {
    id: 'warm',
    label: 'themeStyleWarm',
    hint: 'themeStyleWarmHint',
    swatches: ['#f9f6f0', '#fdfbf7', '#9a6a1f'],
  },
  {
    id: 'graphite',
    label: 'themeStyleGraphite',
    hint: 'themeStyleGraphiteHint',
    swatches: ['#fafafa', '#ffffff', '#3f3f46'],
  },
]
