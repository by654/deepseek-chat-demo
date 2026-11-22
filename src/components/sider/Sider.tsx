import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconPanelLeftOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  IconTrashOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed, useSettings } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import {
  emptyTrash,
  newChat,
  purgeSession,
  removeSession,
  reorderPinnedSession,
  useChatStore,
} from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import {
  folderDescendants,
  folderOptions,
  setActiveWorkspace,
  setFolderFilter,
  setLibraryView,
  setTagFilter,
  useLibrary,
  type SessionView,
} from '../../services/library.js'
import { Button } from '../base/Button.js'
import { AccountSection } from '../account/AccountSection.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem, type SessionItemMode } from './SessionItem.js'
import { OrganizeDialog } from '../features/SessionTools.js'
import { openCommandPalette } from '../features/commandPaletteState.js'
import { openLibrary } from '../features/libraryState.js'
import {
  IconArchiveOutline16,
  IconFolderOutline16,
  IconLibraryOutline16,
  IconTagOutline16,
} from '../features/icons.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：工作区、搜索、归档/回收站、置顶区与按时间分组的会话列表。 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const view = useLibrary((state) => state.view)
  const workspaces = useLibrary((state) => state.workspaces)
  const activeWorkspaceId = useLibrary((state) => state.activeWorkspaceId)
  const folders = useLibrary((state) => state.folders)
  const folderFilter = useLibrary((state) => state.folderFilter)
  const tagFilter = useLibrary((state) => state.tagFilter)
  const hiddenUnlocked = useSettings((state) => state.hiddenUnlocked)
  const [now, setNow] = useState(Date.now)
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deleteMode, setDeleteMode] = useState<'trash' | 'purge' | 'empty'>('trash')
  const [deletePending, setDeletePending] = useState(false)
  const [organizing, setOrganizing] = useState<SessionSummary | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const counts = useMemo(
    () => ({
      archived: sessions.filter((s) => s.archivedAt !== undefined && s.deletedAt === undefined).length,
      trash: sessions.filter((s) => s.deletedAt !== undefined).length,
    }),
    [sessions]
  )

  const folderChoices = folderOptions()

  const allTags = useMemo(
    () => [...new Set(sessions.flatMap((session) => session.tags ?? []))].slice(0, 10),
    [sessions]
  )

  const filtered = useMemo(() => {
    const folderIds = folderFilter ? folderDescendants(folderFilter) : null
    return sessions.filter((session) => {
      if (session.hidden && !hiddenUnlocked) {
        return false
      }
      if (view === 'trash') {
        return session.deletedAt !== undefined
      }
      if (session.deletedAt !== undefined) {
        return false
      }
      if (view === 'archived' ? session.archivedAt === undefined : session.archivedAt !== undefined) {
        return false
      }
      if (activeWorkspaceId && session.workspaceId !== activeWorkspaceId) {
        return false
      }
      if (folderIds && (!session.folderId || !folderIds.has(session.folderId))) {
        return false
      }
      if (tagFilter && !(session.tags ?? []).includes(tagFilter)) {
        return false
      }
      return true
    })
  }, [sessions, view, hiddenUnlocked, activeWorkspaceId, folderFilter, tagFilter])

  const pinned = useMemo(
    () =>
      view === 'active' && !folderFilter && !tagFilter
        ? filtered
            .filter((session) => session.pinned)
            .sort((a, b) => (a.pinnedOrder ?? a.pinnedAt ?? 0) - (b.pinnedOrder ?? b.pinnedAt ?? 0))
        : [],
    [filtered, view, folderFilter, tagFilter]
  )
  const unpinned = useMemo(
    () => filtered.filter((session) => !pinned.some((item) => item.id === session.id)),
    [filtered, pinned]
  )
  const groups = useMemo(() => groupSessions(unpinned, now, t), [unpinned, now, t])
  const trashSorted = useMemo(
    () =>
      view === 'trash'
        ? [...filtered].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
        : [],
    [filtered, view]
  )

  const mode: SessionItemMode = view === 'trash' ? 'trash' : view === 'archived' ? 'archived' : 'active'

  const changeView = (next: SessionView) => {
    setLibraryView(next)
  }

  const item = (session: SessionSummary, draggable = false) => (
    <SessionItem
      key={session.id}
      session={session}
      active={session.id === activeId}
      mode={mode}
      draggable={draggable}
      onDragStart={() => setDragId(session.id)}
      onDragOver={(event) => {
        if (draggable) {
          event.preventDefault()
        }
      }}
      onDrop={() => {
        if (dragId) {
          reorderPinnedSession(dragId, session.id)
        }
        setDragId(null)
      }}
      onOrganize={() => setOrganizing(session)}
      onDelete={() => {
        setDeleteMode(view === 'trash' ? 'purge' : 'trash')
        setDeleting(session)
      }}
    />
  )

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t('appName')}</div>
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>

      <div className={styles.workspaceRow}>
        <select
          className={styles.workspaceSelect}
          aria-label="工作区筛选"
          value={activeWorkspaceId ?? ''}
          onChange={(event) => setActiveWorkspace(event.target.value || null)}
        >
          <option value="">全部工作区</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <IconButton
          icon={<IconSearchOutline16 />}
          tooltip="搜索（Ctrl+K）"
          onClick={openCommandPalette}
        />
        <IconButton
          icon={<IconLibraryOutline16 />}
          tooltip="素材库与资料库"
          onClick={() => openLibrary('stars')}
        />
      </div>

      <div className={styles.viewRow}>
        <button
          type="button"
          className={clsx(styles.viewChip, view === 'active' && styles.viewChipActive)}
          onClick={() => changeView('active')}
        >
          <IconFolderOutline16 />
          全部
        </button>
        <button
          type="button"
          className={clsx(styles.viewChip, view === 'archived' && styles.viewChipActive)}
          onClick={() => changeView('archived')}
        >
          <IconArchiveOutline16 />
          归档
          {counts.archived > 0 ? <span className={styles.count}>{counts.archived}</span> : null}
        </button>
        <button
          type="button"
          className={clsx(styles.viewChip, view === 'trash' && styles.viewChipActive)}
          onClick={() => changeView('trash')}
        >
          <IconTrashOutline16 />
          回收站
          {counts.trash > 0 ? <span className={styles.count}>{counts.trash}</span> : null}
        </button>
      </div>

      {view === 'active' && (folders.length > 0 || allTags.length > 0) ? (
        <div className={styles.filterRow}>
          {folders.length > 0 ? (
            <select
              className={styles.folderSelect}
              aria-label="文件夹筛选"
              value={folderFilter ?? ''}
              onChange={(event) => setFolderFilter(event.target.value || null)}
            >
              <option value="">全部文件夹</option>
              {folderChoices.map((folder) => (
                <option key={folder.value} value={folder.value}>
                  {folder.label}
                </option>
              ))}
            </select>
          ) : null}
          {allTags.length > 0 ? (
            <div className={styles.tagRow}>
              <IconTagOutline16 />
              {tagFilter ? (
                <button
                  type="button"
                  className={clsx(styles.tagChip, styles.tagChipActive)}
                  onClick={() => setTagFilter(null)}
                >
                  {tagFilter} ×
                </button>
              ) : (
                allTags.slice(0, 6).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={styles.tagChip}
                    onClick={() => setTagFilter(tag)}
                  >
                    {tag}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.listWrap}>
        <div className={styles.list}>
          {view === 'trash' ? (
            <>
              <div className={styles.trashHead}>
                <span>回收站保留 30 天</span>
                {trashSorted.length > 0 ? (
                  <button
                    type="button"
                    className={styles.trashAction}
                    onClick={() => {
                      setDeleteMode('empty')
                      setDeleting(null)
                    }}
                  >
                    清空
                  </button>
                ) : null}
              </div>
              {trashSorted.length === 0 ? (
                <div className={styles.empty}>回收站是空的</div>
              ) : (
                trashSorted.map((session) => item(session))
              )}
            </>
          ) : (
            <>
              {pinned.length > 0 ? (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>置顶</div>
                  {pinned.map((session) => item(session, true))}
                </div>
              ) : null}
              {groups.length === 0 ? (
                <div className={styles.empty}>
                  {view === 'archived' ? '还没有归档会话' : '还没有会话'}
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.key} className={styles.section}>
                    <div className={styles.sectionHeader}>{group.label}</div>
                    {group.sessions.map((session) => item(session))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.bottom}>
        <AccountSection />
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>

      {deleting ? (
        <Modal
          title={deleteMode === 'purge' ? '永久删除对话' : '移入回收站'}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (deleteMode === 'purge') {
                      if (await purgeSession(deleting.id)) {
                        setDeleting(null)
                        showToast({ key: 'sessionPurged' })
                      } else {
                        showToast({ key: 'sessionDeleteFailed', type: 'error' })
                      }
                    } else if (await removeSession(deleting.id)) {
                      setDeleting(null)
                      showToast({ key: 'sessionTrashed' })
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {deleteMode === 'purge' ? '永久删除' : '移入回收站'}
              </Button>
            </>
          }
        >
          {deleteMode === 'purge'
            ? '永久删除后，该对话与其中的本地附件将不可恢复。确认删除吗？'
            : '对话会移入回收站，30 天内可以恢复。确认删除吗？'}
        </Modal>
      ) : null}

      {deleteMode === 'empty' ? (
        <Modal
          title="清空回收站"
          onClose={() => setDeleteMode('trash')}
          footer={
            <>
              <Button variant="outlined" onClick={() => setDeleteMode('trash')}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const count = await emptyTrash()
                  setDeleteMode('trash')
                  showToast({ key: 'trashEmptied', params: { count } })
                }}
              >
                清空
              </Button>
            </>
          }
        >
          回收站内的对话与本地附件将被永久删除，无法恢复。
        </Modal>
      ) : null}

      {organizing ? (
        <OrganizeDialog session={organizing} onClose={() => setOrganizing(null)} />
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭；关闭时先播放退场动画再卸载。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }
    if (!rendered) {
      return
    }
    setClosing(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => {
        setRendered(false)
        setClosing(false)
      },
      reduced ? 40 : 220
    )
    return () => window.clearTimeout(timer)
  }, [open, rendered])

  if (!rendered) {
    return null
  }
  return (
    <>
      <div
        className={clsx(styles.drawerMask, closing && styles.drawerMaskClosing)}
        onClick={closeMobileSider}
      />
      <div className={clsx(styles.drawer, closing && styles.drawerClosing)}>
        <Sider mobile />
      </div>
    </>
  )
}
