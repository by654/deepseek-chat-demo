import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useMemo, useState } from 'react'
import { IconDownloadOutline16, IconRefreshOutline16, IconWarningOutline16 } from '../base/icons.js'
import { downloadWord } from '../../services/export/wordExport.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { UsageMeta } from './UsageMeta.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import { useChatStore } from '../../services/chat/store.js'
import { toggleStar, useStars } from '../../services/stars.js'
import { extractTables, downloadCsv, tableName } from '../../services/export/csv.js'
import { downloadSpeechAudio } from '../../services/speech/ttsExport.js'
import { Menu } from '../base/Menu.js'
import {
  IconAudioOutline16,
  IconStarFill16,
  IconStarOutline16,
  IconTableOutline16,
} from '../features/icons.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const wordExportEnabled = useSettings((state) => state.wordExportEnabled)
  const wordFontFamily = useSettings((state) => state.wordFontFamily)
  const wordFontSize = useSettings((state) => state.wordFontSize)
  const wordColor = useSettings((state) => state.wordColor)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  const tables = useMemo(
    () => (answer?.markdown ? extractTables(answer.markdown) : []),
    [answer?.markdown]
  )
  const starred = useStars((state) =>
    state.items.some((item) => item.id === `${sessionId}:${message.id}`)
  )
  const [audioBusy, setAudioBusy] = useState(false)

  const star = () => {
    const session = useChatStore.getState().sessions.find((item) => item.id === sessionId)
    void toggleStar({
      sessionId,
      messageId: message.id,
      sessionTitle: session?.title || '新对话',
      content: (answer?.markdown || responseText).trim(),
      model: message.model,
    }).then((added) => {
      showToast({ key: added ? 'starAdded' : 'starRemoved' })
    })
  }

  const exportAudio = async () => {
    if (audioBusy || !responseText) {
      return
    }
    setAudioBusy(true)
    stopReadAloud()
    try {
      const name = await downloadSpeechAudio(responseText, message.id.slice(0, 8))
      showToast({ key: 'ttsExportDone', params: { name } })
    } catch {
      showToast({ key: 'ttsFailed', type: 'error' })
    } finally {
      setAudioBusy(false)
    }
  }
  return (
    <div className={styles.message} data-quotable data-message-id={message.id} data-reading-scope>
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
        />
      )}
      {answer ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)} data-reading-hide>
            {copyText ? <CopyButton text={copyText} /> : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            {responseText ? (
              <IconButton
                icon={starred ? <IconStarFill16 /> : <IconStarOutline16 />}
                tooltip={starred ? '取消收藏' : '收藏到素材库'}
                tooltipPlacement="bottom"
                onClick={star}
              />
            ) : null}
            {tables.length > 0 ? (
              <Menu
                options={tables.map((table, index) => ({
                  key: String(index),
                  label: `导出表格 ${index + 1}（${table.rows.length} 行）为 CSV`,
                  icon: <IconTableOutline16 />,
                  onSelect: () => {
                    downloadCsv(table, tableName(table, index))
                    showToast({ key: 'tableExported' })
                  },
                }))}
              >
                {({ toggle }) => (
                  <IconButton
                    icon={<IconTableOutline16 />}
                    tooltip="表格导出 CSV"
                    tooltipPlacement="bottom"
                    onClick={toggle}
                  />
                )}
              </Menu>
            ) : null}
            {responseText && !refused ? (
              <IconButton
                icon={<IconAudioOutline16 />}
                tooltip={audioBusy ? '正在生成音频…' : '导出语音 WAV'}
                tooltipPlacement="bottom"
                disabled={audioBusy}
                onClick={() => void exportAudio()}
              />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused}
              onClick={() => {
                stopReadAloud()
                regenerateReply(sessionId, message.id)
              }}
            />
            {wordExportEnabled && answer?.markdown ? (
              <IconButton
                icon={<IconDownloadOutline16 />}
                tooltip={t('exportWord')}
                tooltipPlacement="bottom"
                onClick={() => {
                  const stamp = new Date()
                    .toLocaleString('sv-SE')
                    .replace(/[: ]/g, '-')
                    .slice(0, 16)
                  const name = downloadWord(answer.markdown, {
                    title: t('exportWord'),
                    fontSize: wordFontSize,
                    fontFamily: wordFontFamily,
                    color: wordColor,
                    withMeta: true,
                    baseName: `DeepSeek美化版-${stamp}`,
                  })
                  showToast(t('exportWordDone', { name }))
                }}
              />
            ) : null}
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
      {streaming ? null : <UsageMeta message={message} />}
    </div>
  )
})
