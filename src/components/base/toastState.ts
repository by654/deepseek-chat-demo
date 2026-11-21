import { create } from 'zustand'
import type { LinkedMessage } from '../../i18n/index.js'

/** 轻提示：同一时间只显示一条，新的替换旧的，到时自动消失；文案在渲染时按当前语言翻译 */
type ToastState = { id: number; message: LinkedMessage | string | null; leaving: boolean }

export const useToast = create<ToastState>(() => ({ id: 0, message: null, leaving: false }))

const DURATION = 3000
/** 带链接时多留一些时间，方便点击 */
const LINK_DURATION = 5000
/** 与 Toast.module.css 的退场动画保持一致 */
const EXIT_DURATION = 180
let hideTimer = 0
let removeTimer = 0

export const showToast = (message: LinkedMessage | string) => {
  window.clearTimeout(hideTimer)
  window.clearTimeout(removeTimer)
  useToast.setState((state) => ({ id: state.id + 1, message, leaving: false }))
  const duration = typeof message !== 'string' && message.link ? LINK_DURATION : DURATION
  hideTimer = window.setTimeout(() => {
    useToast.setState({ leaving: true })
    removeTimer = window.setTimeout(
      () => useToast.setState({ message: null, leaving: false }),
      EXIT_DURATION
    )
  }, duration)
}
