import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useUploads, type UploadTask } from '../../services/attachments.js'
import type { DraftAttachment } from '../../services/chat/drafts.js'
import { IconCloseFill14, IconEditOutline16, IconRefreshOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import { FileCard } from '../files/FileCard.js'
import { useFileView } from '../files/useFileView.js'
import {
  IconArrowDownOutline14,
  IconArrowUpOutline14,
} from '../features/icons.js'
import features from '../features/features.module.css'
import styles from './ChatInput.module.css'

const UPLOADING: UploadTask = { status: 'uploading' }

/** 列表只随草稿附件变化更新；每张卡片独立订阅自己的上传状态。 */
export const DraftAttachments = memo(function DraftAttachments({
  items,
  onRetry,
  onRemove,
  onMove,
  onNote,
}: {
  items: DraftAttachment[]
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onNote: (id: string, note: string) => void
}) {
  if (items.length === 0) {
    return null
  }
  return (
    <div className={styles.attachments}>
      {items.map((item, index) => (
        <AttachmentItem
          key={item.id}
          item={item}
          first={index === 0}
          last={index === items.length - 1}
          onRetry={() => onRetry(item.id)}
          onRemove={() => onRemove(item.id)}
          onMove={(direction) => onMove(item.id, direction)}
          onNote={(note) => onNote(item.id, note)}
        />
      ))}
    </div>
  )
})

/** 输入框里的文件：图片显示缩略图，其余显示文件卡片；支持排序与备注。 */
const AttachmentItem = ({
  item,
  first,
  last,
  onRetry,
  onRemove,
  onMove,
  onNote,
}: {
  item: DraftAttachment
  first: boolean
  last: boolean
  onRetry: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  onNote: (note: string) => void
}) => {
  const t = useTranslate()
  const { image, url, link } = useFileView(item.file, item.file.name)
  const task = useUploads((state) => state.tasks[item.id] ?? UPLOADING)
  const [editingNote, setEditingNote] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const status = task.status
  const error = task.status === 'error' ? t(task.error.key, task.error.params) : undefined
  // 过大、格式不支持等重试无效的失败只提示原因，需删除后再发送
  const retry = task.status === 'error' && task.retryable ? onRetry : undefined
  const failed = status === 'error'
  const retryLabel = t('uploadRetry', { message: error ?? t('uploadFileStatusFailed') })
  // 「上传失败」只显示重试图标，其余原因写在图片上：可重试时在图标下方，不可重试时贴底
  const showReason = failed && error !== undefined && error !== t('uploadFileStatusFailed')
  const preview = url ? <img src={url} alt={item.file.name} loading="lazy" decoding="async" /> : null

  const card =
    image && url !== null ? (
      <div
        className={clsx(styles.attachment, failed && styles.attachmentFailed)}
        title={error ?? item.file.name}
      >
        {link && status === 'done' ? <a {...link}>{preview}</a> : preview}
        {status === 'uploading' ? <div className={styles.uploading} /> : null}
        {failed && retry ? (
          <Tooltip content={retryLabel}>
            <button type="button" className={styles.failed} aria-label={retryLabel} onClick={retry}>
              <IconRefreshOutline16 />
              {showReason ? <span className={styles.failedReason}>{error}</span> : null}
            </button>
          </Tooltip>
        ) : null}
        {failed && !retry ? (
          <div className={clsx(styles.failed, styles.failedStatic)} aria-label={error}>
            {showReason ? <span className={styles.failedReason}>{error}</span> : null}
          </div>
        ) : null}
        <button
          type="button"
          className={clsx(styles.remove, failed && !retry && styles.invalidRemove)}
          aria-label={t('delete')}
          onClick={onRemove}
        >
          <IconCloseFill14 />
        </button>
      </div>
    ) : (
      <FileCard
        name={item.file.name}
        size={item.file.size}
        status={status}
        link={link}
        error={error}
        onRetry={retry}
        onRemove={onRemove}
      />
    )

  return (
    <div className={styles.attachmentWrap}>
      {card}
      <div className={features.attachmentTools}>
        <Tooltip content="前移">
          <button
            type="button"
            className={features.attachmentTool}
            disabled={first}
            aria-label="前移附件"
            onClick={() => onMove(-1)}
          >
            <IconArrowUpOutline14 />
          </button>
        </Tooltip>
        <Tooltip content="后移">
          <button
            type="button"
            className={features.attachmentTool}
            disabled={last}
            aria-label="后移附件"
            onClick={() => onMove(1)}
          >
            <IconArrowDownOutline14 />
          </button>
        </Tooltip>
        <Tooltip content={item.note ? '修改备注' : '添加备注'}>
          <button
            type="button"
            className={features.attachmentTool}
            aria-label="附件备注"
            onClick={() => setEditingNote((value) => !value)}
          >
            <IconEditOutline16 />
          </button>
        </Tooltip>
      </div>
      {editingNote ? (
        <input
          className={features.attachmentNote}
          value={note}
          autoFocus
          placeholder="备注"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            onNote(note)
            setEditingNote(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onNote(note)
              setEditingNote(false)
            }
          }}
        />
      ) : item.note ? (
        <div className={features.attachmentNote} title={item.note}>
          {item.note}
        </div>
      ) : null}
    </div>
  )
}
