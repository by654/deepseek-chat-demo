import clsx from 'clsx'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { downloadSessionAttachments } from '../../services/sync/cloudFiles.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { ScrollJump } from '../messages/ScrollJump.js'
import { MobileHeader } from './MobileHeader.js'
import { SessionUsage } from './SessionUsage.js'
import { SessionHeaderActions } from '../features/SessionTools.js'
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
  // 打开会话或新增附件时补齐云端原件；签名不变就不重复请求
  const fileSignature = useMemo(
    () =>
      session.messages
        .flatMap((message) => (message.role === 'user' ? message.files.map((file) => file.id) : []))
        .join(','),
    [session.messages]
  )

  useEffect(() => {
    void downloadSessionAttachments(session)
    // 只在切换会话或附件清单变化时触发；session 对象本身随流式输出频繁变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, fileSignature])

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
        <MobileHeader title={title} actions={<SessionHeaderActions session={session} />} />
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
            {title}
          </div>
          <div className={styles.headerActions} data-reading-hide>
            {session.archivedAt ? <span className={styles.archivedBadge}>已归档</span> : null}
            <SessionHeaderActions session={session} />
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
