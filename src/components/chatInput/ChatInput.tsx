import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconGlobeLanguageOutline14,
  IconPaperclipOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import {
  setSearch,
  setThinking,
  useSettings,
} from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import {
  addDraftFiles,
  clearDraft,
  EMPTY_DRAFT,
  getDraft,
  moveDraftAttachment,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftAttachmentNote,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import {
  enqueueMessage,
  removeQueuedMessage,
  shiftQueue,
  updateQueuedText,
  useMessageQueue,
} from '../../services/chat/queue.js'
import { QueueList } from './QueueList.js'
import { logInfo } from '../../services/logs.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { BalanceButton } from './BalanceButton.js'
import { ModelPicker } from './ModelPicker.js'
import { QuickPanel } from './QuickPanel.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { getSessionModel } from '../../services/chat/model.js'
import { SLASH_COMMANDS, useLibrary } from '../../services/library.js'
import { openLibrary } from '../features/libraryState.js'
import { openCompareDialog } from '../features/commandPaletteState.js'
import {
  IconCompareOutline16,
  IconSnippetOutline16,
  IconSparkleOutline16,
} from '../features/icons.js'
import { Modal } from '../base/Modal.js'
import { Button } from '../base/Button.js'
import { Menu } from '../base/Menu.js'
import { sessionTokens, estimateTokens } from '../../services/usage/tokens.js'
import { costFromTokens, formatCost, priceOf, resolveTier } from '../../services/usage/pricing.js'
import { rewriteText, REWRITE_LABELS, type RewriteAction } from '../../services/rewrite.js'
import * as db from '../../services/chat/db.js'
import type { Session } from '../../services/chat/types.js'
import features from '../features/features.module.css'
import styles from './ChatInput.module.css'

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const VARIABLE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

const findVariables = (text: string) => [
  ...new Set([...text.matchAll(VARIABLE_RE)].map((match) => match[1].trim())),
]

const resolveVariables = (text: string, values: Record<string, string>) =>
  text.replace(VARIABLE_RE, (match, name: string) => values[name.trim()] || match)

const replyText = (session: Session, count = 2) => {
  const messages = getVisibleMessages(session).filter(
    (message) =>
      message.role === 'user' || message.blocks.some((block) => block.type === 'text' && block.text)
  )
  const tail = messages.slice(-count * 2)
  const lines = [`> 引用自「${session.title || '新对话'}」`]
  for (const message of tail) {
    const text =
      message.role === 'user'
        ? message.content
        : message.blocks
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('')
            .slice(0, 600)
    if (text.trim()) {
      lines.push(`> ${message.role === 'user' ? '我' : 'DeepSeek'}：${text.replace(/\n/g, ' ')}`)
    }
  }
  return `${lines.join('\n')}\n\n`
}

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const queueEnabled = useSettings((state) => state.queueEnabled)
  const queueMode = useSettings((state) => state.queueMode)
  const sessionCostLimit = useSettings((state) => state.sessionCostLimit)
  const requestTokenLimit = useSettings((state) => state.requestTokenLimit)
  const longTextFold = useSettings((state) => state.longTextFold)
  const allQueued = useMessageQueue((state) => state.items)
  const sessionQueue = allQueued.filter((item) => item.sessionId === sessionId)
  const sessions = useChatStore((state) => state.sessions)
  const activePersonaId = useLibrary((state) => state.activePersonaId)
  const personas = useLibrary((state) => state.personas)
  const snippets = useLibrary((state) => state.snippets)
  // 流式输出期间仍可输入；排队关闭时与旧行为一致，只能等到本轮结束
  const canQueue = queueEnabled && sessionId !== null
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)
  const rewriteController = useRef<AbortController | null>(null)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [rewriting, setRewriting] = useState(false)
  const [variables, setVariables] = useState<{ names: string[] } | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [costConfirm, setCostConfirm] = useState<{ cost: number; limit: number } | null>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  useEffect(() => () => rewriteController.current?.abort(), [])

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const moveFile = useCallback(
    (id: string, direction: -1 | 1) => moveDraftAttachment(sessionId, id, direction),
    [sessionId]
  )
  const noteFile = useCallback(
    (id: string, note: string) => setDraftAttachmentNote(sessionId, id, note),
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + transcript + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  // 上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && voice.status === 'idle' && draftReady && (!streaming || canQueue)
  // 排队只承载正文：附件需要独立上传流程，等本轮结束后再随草稿发送
  const canQueueNow = canQueue && draftReady && draft.attachments.length === 0

  const estimateRequest = (content: string) => {
    const session = sessionId === null ? null : useChatStore.getState().sessionCache[sessionId]
    let tokens = estimateTokens(content)
    if (session) {
      for (const message of getVisibleMessages(session)) {
        tokens +=
          message.role === 'user'
            ? estimateTokens(message.content)
            : message.blocks.reduce(
                (sum, block) => sum + (block.type === 'text' ? estimateTokens(block.text) : 0),
                0
              )
      }
    }
    return tokens
  }

  const currentSessionCost = () => {
    if (sessionId === null) {
      return 0
    }
    const session = useChatStore.getState().sessionCache[sessionId]
    if (!session) {
      return 0
    }
    const settings = useSettings.getState()
    const model = getSessionModel(sessionId)
    const price = priceOf(settings.pricingTable, model, resolveTier(settings.pricingTier))
    return costFromTokens(sessionTokens(getVisibleMessages(session)), price).total
  }

  const doSend = () => {
    if (useChatStore.getState().importingHistory || voice.status !== 'idle') {
      return
    }
    const prepared = prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    if (!prepared) {
      return
    }
    if (streaming && sessionId !== null) {
      if (!queueEnabled) {
        return
      }
      if (draft.attachments.length > 0) {
        showToast(t('queueAttachmentBlocked'))
        return
      }
      enqueueMessage(sessionId, prepared.text, queueMode)
      logInfo('queue.enqueue', { sessionId, mode: queueMode })
      setDraftText(sessionId, '')
      textareaRef.current?.focus({ preventScroll: true })
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  const send = (force = false) => {
    if (useChatStore.getState().importingHistory || voice.status !== 'idle') {
      return
    }
    const prepared = prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    if (!prepared) {
      return
    }
    const names = findVariables(prepared.text)
    if (names.length > 0 && !force) {
      setVariableValues({})
      setVariables({ names })
      return
    }
    if (requestTokenLimit > 0 && estimateRequest(prepared.text) > requestTokenLimit) {
      showToast({
        key: 'requestTokenLimitReached',
        params: { limit: requestTokenLimit.toLocaleString() },
        type: 'error',
      })
      return
    }
    if (sessionCostLimit > 0) {
      const cost = currentSessionCost()
      if (cost >= sessionCostLimit) {
        setCostConfirm({ cost, limit: sessionCostLimit })
        return
      }
    }
    doSend()
  }

  /*
   * 排队消费：本轮流式输出结束后取出队首一条自动发送。
   * 用户可能正在编辑新草稿，因此先暂存草稿内容，发完再恢复，避免吞掉正在输入的文字。
   */
  useEffect(() => {
    if (streaming || sessionId === null || !queueEnabled) {
      return
    }
    const next = sessionQueue[0]
    if (!next) {
      return
    }
    const snapshot = getDraft(sessionId)
    shiftQueue(sessionId)
    if (!ensureApiKey()) {
      return
    }
    clearDraft(sessionId)
    setDraftText(sessionId, next.text)
    const sent = sendMessage(sessionId)
    logInfo('queue.flush', { sessionId, sent })
    if (snapshot.text.trim().length > 0) {
      setDraftText(sessionId, snapshot.text)
    }
    if (snapshot.attachments.length > 0) {
      addDraftFiles(
        sessionId,
        snapshot.attachments.map((item) => item.file),
        useSettings.getState().apiKey ?? ''
      )
    }
  }, [queueEnabled, sessionId, sessionQueue, streaming])

  const slashMatch = /^\/([^\s]*)$/.exec(text)
  const slashItems = slashMatch
    ? [
        ...SLASH_COMMANDS.filter((command) =>
          command.label.slice(1).toLowerCase().startsWith(slashMatch[1].toLowerCase())
        ).map((command) => ({
          id: command.id,
          label: command.label,
          hint: command.hint,
          text: command.insert,
        })),
        ...snippets
          .filter((snippet) => snippet.name.toLowerCase().includes(slashMatch[1].toLowerCase()))
          .map((snippet) => ({
            id: snippet.id,
            label: `片段 · ${snippet.name}`,
            hint: snippet.text.slice(0, 60),
            text: snippet.text,
          })),
      ]
    : []

  const mentionMatches =
    mentionQuery === null
      ? []
      : sessions
          .filter(
            (session) =>
              session.id !== sessionId &&
              session.deletedAt === undefined &&
              (!session.hidden || useSettings.getState().hiddenUnlocked) &&
              (session.title || '新对话').toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 6)

  const insertMention = async (target: Session) => {
    const stored = target
    const quote = replyText(stored)
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const match = /(^|\s)@([^\s@]*)$/.exec(current)
    const start = match ? match.index + match[1].length : current.length
    setText(current.slice(0, start) + quote + current.slice(current.length))
    setMentionQuery(null)
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      const position = start + quote.length
      textarea?.setSelectionRange(position, position)
    })
  }

  const chooseMention = async (id: string) => {
    const stored = await db.loadSession(id)
    if (stored) {
      await insertMention(stored)
    }
  }

  const refreshSelection = () => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd })
  }

  const selectedText = text.slice(selection.start, selection.end)
  const showRewrite = selectedText.trim().length > 0 && !importingHistory

  const runRewrite = async (action: RewriteAction) => {
    if (!ensureApiKey() || rewriting) {
      return
    }
    const source = getDraft(sessionId).text.slice(selection.start, selection.end)
    if (!source.trim()) {
      return
    }
    const controller = new AbortController()
    rewriteController.current = controller
    setRewriting(true)
    try {
      const result = await rewriteText(source, action, controller.signal)
      const current = getDraft(sessionId).text
      const next = current.slice(0, selection.start) + result + current.slice(selection.end)
      setText(next)
      showToast({ key: 'rewriteDone', params: { action: REWRITE_LABELS[action] } })
      requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true })
        textareaRef.current?.setSelectionRange(selection.start, selection.start + result.length)
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast({ key: 'rewriteFailed', type: 'error' })
      }
    } finally {
      if (rewriteController.current === controller) {
        setRewriting(false)
      }
    }
  }

  const textareaRect = textareaRef.current?.getBoundingClientRect()
  const floatingStyle =
    textareaRect && typeof window !== 'undefined'
      ? {
          position: 'fixed' as const,
          left: Math.max(8, textareaRect.left + 12),
          bottom: window.innerHeight - textareaRect.top + 8,
          width: Math.min(380, textareaRect.width - 24),
          zIndex: 80,
        }
      : undefined

  const openTool = (tool: 'compare' | 'snippets' | 'personas') => {
    if (tool === 'compare') {
      if (ensureApiKey()) {
        openCompareDialog(getDraft(sessionId).text)
      }
    } else if (tool === 'snippets') {
      openLibrary('snippets')
    } else {
      openLibrary('personas')
    }
  }

  return (
    <>
      <div
        className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            textareaRef.current?.focus({ preventScroll: true })
          }
        }}
      >
        <DraftAttachments
          items={attachments}
          onRetry={retryFile}
          onRemove={removeFile}
          onMove={moveFile}
          onNote={noteFile}
        />
        <QueueList
          items={sessionQueue}
          onEdit={updateQueuedText}
          onRemove={removeQueuedMessage}
        />
        <div className={styles.textareaWrapper}>
          <textarea
            ref={textareaRef}
            className={clsx(styles.textarea, recording && isMobile && styles.textareaHidden)}
            placeholder={t('chatInputPlaceholderChat')}
            rows={2}
            // 移动端不自动聚焦，避免一打开就弹出键盘
            autoFocus={!isMobile}
            disabled={importingHistory}
            value={text}
            onChange={(event) => {
              const value = event.target.value
              setText(value)
              setSlashDismissed(false)
              const caret = event.target.selectionStart ?? value.length
              const before = value.slice(0, caret)
              const mention = /(^|\s)@([^\s@]*)$/.exec(before)
              setMentionQuery(mention ? mention[2] : null)
            }}
            onSelect={refreshSelection}
            onKeyUp={refreshSelection}
            onMouseUp={refreshSelection}
            onMouseDown={(event) => {
              // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
              if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
                event.preventDefault()
                event.currentTarget.focus({ preventScroll: true })
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSlashDismissed(true)
                setMentionQuery(null)
                return
              }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send()
              }
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length > 0) {
                event.preventDefault()
                acceptFiles(files)
                return
              }
              const pasted = event.clipboardData.getData('text')
              if (longTextFold > 0 && pasted.length > longTextFold) {
                event.preventDefault()
                const file = new File(
                  [pasted],
                  `粘贴文本-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.txt`,
                  { type: 'text/plain' }
                )
                acceptFiles([file])
                showToast({
                  key: 'longTextFolded',
                  params: { count: pasted.length.toLocaleString() },
                })
              }
            }}
          />
          {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
          <div className={styles.mirror} aria-hidden>
            {`${text}\n`}
          </div>
        </div>
        <div className={styles.functionRow}>
          {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
          <div ref={togglesRef} className={styles.toggles}>
            <Tooltip content={t('deactivatedThinkTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, thinking && styles.selected)}
                aria-label={t('thinkingSwitch')}
                aria-pressed={thinking}
                onClick={() => setThinking(!thinking)}
              >
                <IconThinkOutline14 />
                <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('deactivatedSearchTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, search && styles.selected)}
                aria-label={t('search')}
                aria-pressed={search}
                onClick={() => setSearch(!search)}
              >
                <IconGlobeLanguageOutline14 />
                <span className={styles.toggleLabel}>{t('search')}</span>
              </button>
            </Tooltip>
          </div>
          <div className={styles.right}>
            {/* 窄屏把模型与余额收进箭头面板，避免小号屏幕上控件互相挤压 */}
            {isMobile ? null : (
              <>
                <ModelPicker sessionId={sessionId} />
                <BalanceButton />
                <IconButton
                  icon={<IconCompareOutline16 />}
                  tooltip="双模型对比"
                  onClick={() => openTool('compare')}
                />
                <IconButton
                  icon={<IconSnippetOutline16 />}
                  tooltip="常用片段"
                  onClick={() => openTool('snippets')}
                />
                <IconButton
                  icon={<IconSparkleOutline16 />}
                  tooltip={
                    activePersonaId
                      ? `提示词：${personas.find((item) => item.id === activePersonaId)?.name ?? ''}`
                      : '提示词库'
                  }
                  onClick={() => openTool('personas')}
                />
              </>
            )}
            {isMobile ? (
              <Menu
                options={[
                  {
                    key: 'compare',
                    label: '双模型对比',
                    icon: <IconCompareOutline16 />,
                    onSelect: () => openTool('compare'),
                  },
                  {
                    key: 'snippets',
                    label: '常用片段',
                    icon: <IconSnippetOutline16 />,
                    onSelect: () => openTool('snippets'),
                  },
                  {
                    key: 'personas',
                    label: '提示词库',
                    icon: <IconSparkleOutline16 />,
                    onSelect: () => openTool('personas'),
                  },
                ]}
              >
                {({ toggle }) => (
                  <IconButton
                    icon={<IconSparkleOutline16 />}
                    aria-label="更多输入工具"
                    onClick={toggle}
                  />
                )}
              </Menu>
            ) : null}
            <VoiceButton
              status={voice.status}
              disabled={!voice.available}
              seconds={voice.seconds}
              onClick={() => {
                if (
                  voice.status !== 'idle' ||
                  (!useChatStore.getState().importingHistory && ensureApiKey())
                ) {
                  void voice.toggle()
                }
              }}
            />
            <IconButton
              size="m"
              tone="primary"
              icon={<IconPaperclipOutline16 />}
              tooltip={t('uploadFile')}
              disabled={importingHistory}
              onClick={() => ensureApiKey() && fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={ACCEPT}
              onChange={(event) => {
                acceptFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            {isMobile ? <QuickPanel sessionId={sessionId} /> : null}
            {streaming && sessionId ? (
              <>
                {/* 输出期间仍可把新消息排进队列，本轮结束后依次自动发送 */}
                {queueEnabled ? (
                  <button
                    type="button"
                    className={clsx(styles.queueSendButton, !canQueueNow && styles.disabled)}
                    aria-label={t('queueSend')}
                    aria-disabled={!canQueueNow}
                    onClick={() => send()}
                  >
                    {sessionQueue.length > 0 ? (
                      <span className={styles.queueBadge}>{sessionQueue.length}</span>
                    ) : null}
                    <IconSendOutline16 />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.sendButton}
                  aria-label={t('chatInputStopButtonTooltip')}
                  onClick={() => {
                    stopReadAloud()
                    stopReply(sessionId)
                  }}
                >
                  <IconStopFill16 />
                </button>
              </>
            ) : (
              <button
                type="button"
                className={clsx(styles.sendButton, !canSend && styles.disabled)}
                aria-label={t('send')}
                aria-disabled={!canSend}
                onClick={() => send()}
              >
                <IconSendOutline16 />
              </button>
            )}
          </div>
        </div>
        {dragging ? <DragMask /> : null}
      </div>

      {slashMatch && !slashDismissed && slashItems.length > 0 && floatingStyle
        ? createPortal(
            <div className={features.popover} style={floatingStyle}>
              {slashItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={features.popoverItem}
                  onClick={() => {
                    setText(item.text)
                    setSlashDismissed(true)
                    requestAnimationFrame(() => {
                      textareaRef.current?.focus({ preventScroll: true })
                      textareaRef.current?.setSelectionRange(item.text.length, item.text.length)
                    })
                  }}
                >
                  <span className={features.popoverLabel}>{item.label}</span>
                  <span className={features.popoverHint}>{item.hint}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}

      {mentionQuery !== null && floatingStyle
        ? createPortal(
            <div className={features.popover} style={floatingStyle}>
              {mentionMatches.length === 0 ? (
                <div className={features.empty}>没有匹配的会话</div>
              ) : (
                mentionMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={features.popoverItem}
                    onClick={() => void chooseMention(item.id)}
                  >
                    <span className={features.popoverLabel}>{item.title || '新对话'}</span>
                    <span className={features.popoverHint}>引用该会话最近两轮对话</span>
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}

      {showRewrite && floatingStyle
        ? createPortal(
            <div className={features.rewriteBar} style={{ ...floatingStyle, width: 'auto' }}>
              {rewriting ? (
                <span className={features.rewriteLoading}>改写中…</span>
              ) : (
                (Object.keys(REWRITE_LABELS) as RewriteAction[]).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={features.rewriteButton}
                    onClick={() => void runRewrite(action)}
                  >
                    {REWRITE_LABELS[action]}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}

      {variables ? (
        <Modal
          title="填写提示词变量"
          closable
          onClose={() => setVariables(null)}
          footer={
            <>
              <Button variant="outlined" onClick={() => setVariables(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  const resolved = resolveVariables(getDraft(sessionId).text, variableValues)
                  setDraftText(sessionId, resolved)
                  setVariables(null)
                  requestAnimationFrame(() => send(true))
                }}
              >
                发送
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(420px, 70vw)' }}>
            {variables.names.map((name) => (
              <label key={name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: 'var(--ui-text-2)', fontSize: 12 }}>{name}</span>
                <input
                  className={features.input}
                  autoFocus={variables.names[0] === name}
                  value={variableValues[name] ?? ''}
                  onChange={(event) =>
                    setVariableValues((current) => ({ ...current, [name]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        </Modal>
      ) : null}

      {costConfirm ? (
        <Modal
          title="本会话费用已达上限"
          closable
          onClose={() => setCostConfirm(null)}
          footer={
            <>
              <Button variant="outlined" onClick={() => setCostConfirm(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  setCostConfirm(null)
                  requestAnimationFrame(() => send(true))
                }}
              >
                继续发送
              </Button>
            </>
          }
        >
          <div style={{ width: 'min(420px, 70vw)', lineHeight: 1.7 }}>
            当前会话已花费 {formatCost(costConfirm.cost)}，超过你设置的 {formatCost(costConfirm.limit)}{' '}
            单会话上限。继续发送可能产生更多费用。
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ui-text-3)' }}>
              可在「设置 → 用量与统计」调整或关闭上限。
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
