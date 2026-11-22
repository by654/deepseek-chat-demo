import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import type { Session, SessionSummary } from '../../services/chat/types.js'
import {
  archiveSession,
  cloneSession,
  newChat,
  removeSession,
  selectSession,
  setSessionFolder,
  setSessionHidden,
  setSessionPersona,
  setSessionTags,
  setSessionWorkspace,
  useChatStore,
} from '../../services/chat/store.js'
import { folderOptions, useLibrary } from '../../services/library.js'
import { useSettings, setReadingMode } from '../../services/settings.js'
import {
  createSnapshot,
  forkSnapshot,
  listSnapshots,
  removeSnapshot,
  type SnapshotItem,
} from '../../services/snapshots.js'
import {
  downloadSessionImage,
  downloadSessionMarkdown,
  printSession,
} from '../../services/export/sessionExport.js'
import { redactionSummary } from '../../services/redact.js'
import { ShareDialog } from './ShareDialog.js'
import { showToast } from '../base/toastState.js'
import { IconButton } from '../base/IconButton.js'
import { IconEllipsisOutline16 } from '../base/icons.js'
import { Menu } from '../base/Menu.js'
import { Modal } from '../base/Modal.js'
import { Button } from '../base/Button.js'
import {
  IconArchiveOutline16,
  IconDownloadOutline16,
  IconFolderOutline16,
  IconLockOutline16,
  IconPinOutline16,
  IconSnapshotOutline16,
  IconStarOutline16,
} from './icons.js'
import styles from './features.module.css'

/** 会话页标题右侧的操作入口：整理、快照、导出、克隆、归档与隐藏。 */
export const SessionHeaderActions = ({ session }: { session: Session }) => {
  const t = useTranslate()
  const exportRedact = useSettings((state) => state.exportRedact)
  const reading = useSettings((state) => state.readingMode)
  const [organizeOpen, setOrganizeOpen] = useState(false)
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  return (
    <>
      <Menu
        options={[
          {
            key: 'organize',
            label: '整理会话（文件夹 / 标签 / 工作区）',
            icon: <IconFolderOutline16 />,
            onSelect: () => setOrganizeOpen(true),
          },
          {
            key: 'snapshots',
            label: '会话快照',
            icon: <IconSnapshotOutline16 />,
            onSelect: () => setSnapshotsOpen(true),
          },
          {
            key: 'share',
            label: '分享会话（只读链接）',
            icon: <IconSnapshotOutline16 />,
            onSelect: () => setShareOpen(true),
          },
          {
            key: 'export-md',
            label: exportRedact ? '导出 Markdown（已脱敏）' : '导出 Markdown',
            icon: <IconDownloadOutline16 />,
            onSelect: () => {
              const name = downloadSessionMarkdown(session, exportRedact)
              showToast({ key: 'exportMarkdownDone', params: { name } })
            },
          },
          {
            key: 'export-pdf',
            label: '打印 / 另存为 PDF',
            icon: <IconDownloadOutline16 />,
            onSelect: () => {
              if (!printSession(session, exportRedact)) {
                showToast({ key: 'exportPrintBlocked', type: 'error' })
              } else if (exportRedact) {
                showToast({ key: 'exportRedactedHint' })
              }
            },
          },
          {
            key: 'export-png',
            label: '导出长图 PNG',
            icon: <IconDownloadOutline16 />,
            onSelect: () => {
              try {
                const name = downloadSessionImage(session, exportRedact)
                showToast({ key: 'exportMarkdownDone', params: { name } })
              } catch {
                showToast({ key: 'exportPrintBlocked', type: 'error' })
              }
            },
          },
          {
            key: 'clone',
            label: '克隆为新会话',
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
            key: 'reading',
            label: reading ? '退出阅读模式' : '阅读模式',
            icon: <IconStarOutline16 />,
            onSelect: () => setReadingMode(!reading),
          },
          {
            key: 'archive',
            label: '归档',
            icon: <IconArchiveOutline16 />,
            onSelect: () => {
              archiveSession(session.id)
              newChat()
              showToast({ key: 'sessionArchived' })
            },
          },
          {
            key: 'hide',
            label: '隐藏（需要 PIN）',
            icon: <IconLockOutline16 />,
            onSelect: () => {
              if (!useSettings.getState().lockPinHash) {
                showToast({ key: 'lockPinNotSet', type: 'error' })
                return
              }
              setSessionHidden(session.id, true)
              newChat()
              showToast({ key: 'sessionHiddenDone' })
            },
          },
          {
            key: 'trash',
            label: '移入回收站',
            icon: <IconPinOutline16 />,
            danger: true,
            onSelect: () => {
              void removeSession(session.id).then((ok) => {
                if (ok) {
                  showToast({ key: 'sessionTrashed' })
                }
              })
            },
          },
        ]}
      >
        {({ toggle }) => (
          <IconButton
            icon={<IconEllipsisOutline16 />}
            aria-label={t('more')}
            tooltip={t('more')}
            onClick={toggle}
          />
        )}
      </Menu>
      {organizeOpen ? <OrganizeDialog session={session} onClose={() => setOrganizeOpen(false)} /> : null}
      {snapshotsOpen ? (
        <SnapshotsDialog session={session} onClose={() => setSnapshotsOpen(false)} />
      ) : null}
      {shareOpen ? <ShareDialog session={session} onClose={() => setShareOpen(false)} /> : null}
    </>
  )
}

export const OrganizeDialog = ({
  session,
  onClose,
}: {
  session: SessionSummary
  onClose: () => void
}) => {
  const workspaces = useLibrary((state) => state.workspaces)
  const personas = useLibrary((state) => state.personas)
  const folderChoices = folderOptions()
  const [folderId, setFolderId] = useState(session.folderId ?? '')
  const [workspaceId, setWorkspaceId] = useState(session.workspaceId ?? '')
  const [personaId, setPersonaId] = useState(session.personaId ?? '')
  const [tags, setTags] = useState((session.tags ?? []).join('，'))

  return (
    <Modal
      title="整理会话"
      closable
      className={styles.snapshotModal}
      onClose={onClose}
      footer={
        <>
          <Button size="s" variant="outlined" onClick={onClose}>
            取消
          </Button>
          <Button
            size="s"
            onClick={() => {
              setSessionFolder(session.id, folderId || null)
              setSessionWorkspace(session.id, workspaceId || null)
              setSessionPersona(session.id, personaId || null)
              setSessionTags(session.id, tags.split(/[,，\s]+/))
              showToast({ key: 'sessionOrganized' })
              onClose()
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className={styles.organize}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>文件夹</span>
          <select
            className={styles.selectNative}
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
          >
            <option value="">未分类</option>
            {folderChoices.map((folder) => (
              <option key={folder.value} value={folder.value}>
                {folder.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>标签（逗号分隔）</span>
          <input
            className={styles.input}
            value={tags}
            placeholder="测试会话, 方案, 重要"
            onChange={(event) => setTags(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>工作区</span>
          <select
            className={styles.selectNative}
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            <option value="">不归属</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>提示词库</span>
          <select
            className={styles.selectNative}
            value={personaId}
            onChange={(event) => setPersonaId(event.target.value)}
          >
            <option value="">不指定</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </label>
        {useSettings.getState().exportRedact ? (
          <div className={styles.paletteFoot}>{redactionSummary}</div>
        ) : null}
      </div>
    </Modal>
  )
}

const SnapshotsDialog = ({ session, onClose }: { session: Session; onClose: () => void }) => {
  const [items, setItems] = useState<SnapshotItem[]>([])
  const [busy, setBusy] = useState(false)
  const activeSessionId = useChatStore((state) => state.activeId)

  useEffect(() => {
    let alive = true
    void listSnapshots(session.id).then((list) => {
      if (alive) {
        setItems(list)
      }
    })
    return () => {
      alive = false
    }
  }, [session.id])

  const refresh = async () => setItems(await listSnapshots(session.id))

  return (
    <Modal
      title="会话快照"
      closable
      className={styles.snapshotModal}
      onClose={onClose}
      footer={
        <Button
          size="s"
          disabled={busy || activeSessionId !== session.id || useChatStore.getState().streaming[session.id] !== undefined}
          onClick={async () => {
            setBusy(true)
            try {
              await createSnapshot(session)
              await refresh()
              showToast({ key: 'snapshotCreated' })
            } finally {
              setBusy(false)
            }
          }}
        >
          打一个快照
        </Button>
      }
    >
      <div className={styles.list}>
        {items.length === 0 ? (
          <div className={styles.empty}>快照保存当前完整的消息树，可从任意快照分叉继续追问。</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.snapshotRow}>
              <div className={styles.snapshotMain}>
                <div className={styles.snapshotTitle}>{item.label}</div>
                <div className={styles.snapshotMeta}>
                  {new Date(item.createdAt).toLocaleString('zh-CN')} · {item.messages.length} 条消息
                </div>
              </div>
              <button
                type="button"
                className={styles.chip}
                onClick={async () => {
                  const id = await forkSnapshot(item)
                  onClose()
                  showToast({ key: 'snapshotForked' })
                  selectSession(id)
                }}
              >
                从快照分叉
              </button>
              <IconButton
                icon={<IconPinOutline16 />}
                tooltip="删除快照"
                onClick={async () => {
                  await removeSnapshot(item.id)
                  await refresh()
                }}
              />
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
