import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
const openModals: object[] = []

/** 遮罩 + 居中卡片，Esc / 点遮罩关闭 */
export const Modal = ({
  title,
  children,
  footer,
  closable = false,
  className,
  mainClassName,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  className?: string
  /** 内容区的 class */
  mainClassName?: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // 关闭前先播放退场动画；父组件若因忙碌拒绝关闭，短暂后恢复可交互状态
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const timers = useRef<number[]>([])

  const requestClose = () => {
    if (closingRef.current) {
      return
    }
    closingRef.current = true
    setClosing(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 40 : 160
    timers.current.push(
      window.setTimeout(() => {
        onCloseRef.current()
        timers.current.push(
          window.setTimeout(() => {
            closingRef.current = false
            setClosing(false)
          }, 60)
        )
      }, duration)
    )
  }

  useEffect(() => {
    const token = {}
    openModals.push(token)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals.at(-1) === token) {
        requestClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      openModals.splice(openModals.indexOf(token), 1)
      document.removeEventListener('keydown', onKeyDown)
      for (const timer of timers.current) {
        window.clearTimeout(timer)
      }
      timers.current = []
    }
  }, [])

  return createPortal(
    <div
      className={clsx(styles.overlay, closing && styles.overlayClosing)}
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <div
        className={clsx(styles.content, className, closing && styles.contentClosing)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={requestClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
