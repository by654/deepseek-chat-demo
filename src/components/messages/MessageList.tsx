import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import {
  consumeRestorePosition,
  readViewPosition,
  saveViewPosition,
} from '../../services/chat/sessionMemory.js'
import type { Session } from '../../services/chat/types.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { AssistantMessage } from './AssistantMessage.js'
import { registerJumpToBottom, setAwayFromBottom } from './jumpState.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import { useJump } from '../../services/chat/jump.js'
import styles from './MessageList.module.css'
import type { Message } from '../../services/chat/types.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}

/** 距底部小于该值时视为在底部，流式内容增长时跟随 */
const STICKY_THRESHOLD = 40
/** 距底部超过该值时显示「回到底部」按钮，避免贴边抖动 */
const JUMP_THRESHOLD = 120
/** 首屏只渲染最近 50 条，向上滚动或点击按钮再加载更早消息。 */
const PAGE_SIZE = 50
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
}: {
  session: Session
  streaming: boolean
  footer: React.ReactNode
}) => {
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  const messages = getVisibleMessages(session)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const jumpRequest = useJump((state) => state.request)
  const lastJumpToken = useRef(0)
  const loadMoreRef = useRef<{ height: number } | null>(null)
  const hiddenCount = Math.max(0, messages.length - visibleCount)
  const shownMessages = hiddenCount > 0 ? messages.slice(hiddenCount) : messages
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }
  const lastMessageId = messages.at(-1)?.id
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el && stickyRef.current) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  // 切换会话回到最近 50 条
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    loadMoreRef.current = null
  }, [session.id])

  // 加载更早消息后保持阅读位置不跳动
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = loadMoreRef.current
    if (el && anchor) {
      el.scrollTop += el.scrollHeight - anchor.height
      scrollTopRef.current = el.scrollTop
      loadMoreRef.current = null
    }
  }, [visibleCount])

  const loadEarlier = useCallback(() => {
    const el = scrollRef.current
    loadMoreRef.current = { height: el?.scrollHeight ?? 0 }
    setVisibleCount((count) => Math.min(messages.length, count + PAGE_SIZE))
  }, [messages.length])

  // 命令面板跳转：展开到目标消息，居中滚动并短暂高亮
  useEffect(() => {
    const request = jumpRequest
    if (!request || request.sessionId !== session.id || request.token === lastJumpToken.current) {
      return
    }
    const index = messages.findIndex((message) => message.id === request.messageId)
    if (index < 0) {
      return
    }
    lastJumpToken.current = request.token
    if (index < hiddenCount) {
      setVisibleCount(messages.length - index + 2)
      return
    }
    const timer = window.setTimeout(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(request.messageId)}"]`
      )
      if (!el) {
        return
      }
      stickyRef.current = false
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.style.transition = 'box-shadow 200ms ease-out'
      el.style.boxShadow = '0 0 0 2px var(--ui-brand), 0 0 0 6px var(--ui-brand-soft)'
      el.style.borderRadius = '12px'
      window.setTimeout(() => {
        el.style.boxShadow = ''
        el.style.borderRadius = ''
      }, 1800)
    }, 60)
    return () => window.clearTimeout(timer)
  }, [jumpRequest, session.id, messages, hiddenCount])

  // 内容、键盘和输入框高度变化时，继续遵循当前跟随状态。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const observer = new ResizeObserver(scrollToBottom)
    observer.observe(content)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, scrollToBottom, session.id])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
      }
      restoreScrollRef.current = null
      return
    }
    stickyRef.current = true
    setAwayFromBottom(false)
    if (consumeRestorePosition(session.id) && scroll) {
      const saved = readViewPosition(session.id)
      if (saved !== null) {
        scroll.scrollTop = saved
        scrollTopRef.current = scroll.scrollTop
        stickyRef.current = false
        setAwayFromBottom(
          scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > JUMP_THRESHOLD
        )
        return
      }
    }
    scrollToBottom()
  }, [session.id, lastMessageId, scrollToBottom])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  // 注册「回到底部」：平滑滚动到最新消息，同时恢复底部跟随。
  useEffect(
    () =>
      registerJumpToBottom(() => {
        const el = scrollRef.current
        if (!el) {
          return
        }
        stickyRef.current = true
        setAwayFromBottom(false)
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
      }),
    []
  )

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
      restoreScrollRef.current = { messageId, top: anchorTop }
      stickyRef.current = false
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
    },
    [session.id, streaming]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
    }
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      const nearBottom = distance < STICKY_THRESHOLD
      // 仅在用户向上滚动时停止跟随底部，布局或内容增高时保持跟随状态。
      if (nearBottom) {
        stickyRef.current = true
      } else if (el.scrollTop < scrollTopRef.current) {
        stickyRef.current = false
      }
      // 向上滚动到顶部附近时自动加载更早的消息
      if (el.scrollTop < 24 && hiddenCount > 0) {
        loadEarlier()
      }
      // 离开底部一定距离才亮出向下箭头，回到底部立即隐藏。
      setAwayFromBottom(distance > JUMP_THRESHOLD)
      scrollTopRef.current = el.scrollTop
      saveViewPosition(session.id, el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollToBottom, session.id, hiddenCount, loadEarlier])

  const lastIndex = messages.length - 1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  return (
    <ScrollToBottomContext.Provider value={scrollToBottom}>
      <div className={styles.container}>
        <div ref={scrollRef} className={styles.scroll}>
          <div ref={contentRef} className={styles.column}>
            {hiddenCount > 0 ? (
              <button type="button" className={styles.loadEarlier} onClick={loadEarlier}>
                加载更早的 {Math.min(PAGE_SIZE, hiddenCount)} 条消息
              </button>
            ) : null}
            {shownMessages.map((message, shownIndex) => {
              const index = hiddenCount + shownIndex
              return message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  retryUploadId={uploadRetryId}
                  isFirst={index === 0}
                  isLast={index === lastIndex || index === lastIndex - 1}
                  busy={streaming}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              ) : (
                <AssistantMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  isLast={index === lastIndex}
                  streaming={streaming && index === lastIndex}
                  busy={streaming}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              )
            })}
          </div>
        </div>
        {footer}
      </div>
    </ScrollToBottomContext.Provider>
  )
}
