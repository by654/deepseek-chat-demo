import clsx from 'clsx'
import { useLayoutEffect, useRef } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { ScrollJump } from '../messages/ScrollJump.js'
import { MobileHeader } from './MobileHeader.js'
import { SessionUsage } from './SessionUsage.js'
import styles from './SessionView.module.css'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const viewRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const title = session.title || t('untitledChat')

  // 把输入区实测高度写入 CSS 变量，供「回到底部」按钮避开输入框
  useLayoutEffect(() => {
    const view = viewRef.current
    const footer = footerRef.current
    if (!view || !footer) {
      return
    }
    const update = () => {
      view.style.setProperty('--session-footer-height', `${footer.offsetHeight}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [isMobile])

  return (
    <div ref={viewRef} className={styles.view}>
      {isMobile ? (
        <MobileHeader title={title} />
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
            {title}
          </div>
        </div>
      )}
      <MessageList
        session={session}
        streaming={streaming}
        footer={
          <div ref={footerRef} className={styles.inputContainer}>
            <SessionUsage session={session} />
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        }
      />
      <ScrollJump />
    </div>
  )
}
