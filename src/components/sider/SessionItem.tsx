import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconTrashOutline16,
} from '../base/icons.js'
import {
  archiveSession,
  cloneSession,
  renameSession,
  restoreSession,
  selectSession,
  setSessionPinned,
  unarchiveSession,
  useChatStore,
} from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { showToast } from '../base/toastState.js'
import { closeMobileSider } from './mobileSiderState.js'
import {
  IconArchiveOutline16,
  IconFolderOutline16,
  IconLockOutline16,
  IconPinOutline16,
  IconRestoreOutline16,
  IconStarOutline16,
  IconTrashOutline16 as IconTrashFeature,
} from '../features/icons.js'
import styles from './SessionItem.module.css'

export type SessionItemMode = 'active' | 'archived' | 'trash'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  mode = 'active',
  onDelete,
  onOrganize,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  session: SessionSummary
  active: boolean
  mode?: SessionItemMode
  onDelete: () => void
  onOrganize?: () => void
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (event: React.DragEvent) => void
  onDrop?: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const streaming = useChatStore((state) => Object.hasOwn(state.streaming, session.id))
  const displayTitle = session.title || t('untitledChat')

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  const menuOptions =
    mode === 'trash'
      ? [
          {
            key: 'restore',
            label: '从回收站恢复',
            icon: <IconRestoreOutline16 />,
            onSelect: () => {
              restoreSession(session.id)
              showToast({ key: 'sessionRestored' })
            },
          },
          {
            key: 'purge',
            label: '永久删除',
            icon: <IconTrashOutline16 />,
            danger: true,
            onSelect: onDelete,
          },
        ]
      : [
          {
            key: 'rename',
            label: t('sessionItemMenuRenameOption'),
            icon: <IconEditOutline16 />,
            onSelect: () => setEditing(true),
          },
          {
            key: 'pin',
            label: session.pinned ? '取消置顶' : '置顶',
            icon: <IconPinOutline16 />,
            onSelect: () => setSessionPinned(session.id, !session.pinned),
          },
          {
            key: 'organize',
            label: '整理（文件夹 / 标签）',
            icon: <IconFolderOutline16 />,
            onSelect: () => onOrganize?.(),
          },
          {
            key: 'clone',
            label: '克隆会话',
            icon: <IconStarOutline16 />,
            onSelect: () => {
              void cloneSession(session.id).then((id) => {
                if (id) {
                  showToast({ key: 'sessionCloned' })
                }
              })
            },
          },
          {
            key: mode === 'archived' ? 'unarchive' : 'archive',
            label: mode === 'archived' ? '取消归档' : '归档',
            icon: <IconArchiveOutline16 />,
            onSelect: () => {
              if (mode === 'archived') {
                unarchiveSession(session.id)
                showToast({ key: 'sessionUnarchived' })
              } else {
                archiveSession(session.id)
                showToast({ key: 'sessionArchived' })
              }
            },
          },
          {
            key: 'delete',
            label: '移入回收站',
            icon: <IconTrashFeature />,
            danger: true,
            onSelect: onDelete,
          },
        ]

  return (
    <div
      className={clsx(styles.item, active && styles.active, draggable && styles.draggableItem)}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', session.id)
        onDragStart?.()
      }}
      onDragOver={(event) => {
        onDragOver?.(event)
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop?.()
      }}
      onClick={() => {
        if (mode === 'trash') {
          return
        }
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      <div className={styles.title}>
        {session.pinned && mode === 'active' ? (
          <span className={styles.pinIcon} aria-label="已置顶">
            <IconPinOutline16 />
          </span>
        ) : null}
        {session.hidden ? (
          <span className={styles.pinIcon} aria-label="隐藏会话">
            <IconLockOutline16 />
          </span>
        ) : null}
        <span className={styles.titleText}>{displayTitle}</span>
        {streaming ? <span className={styles.streamingDot} aria-label="生成中" /> : null}
      </div>
      <div className={styles.action} onClick={(event) => event.stopPropagation()}>
        <Menu options={menuOptions}>
          {({ toggle }) => (
            <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
          )}
        </Menu>
      </div>
    </div>
  )
})
