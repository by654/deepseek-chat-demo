import { useCallback, useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  FEATURES_SQL_PATH,
  adminDeleteAnnouncement,
  adminDeleteFeedback,
  adminListAnnouncements,
  adminListAudit,
  adminListFeedback,
  adminSaveAnnouncement,
  adminSetFeedbackStatus,
  adminStats,
  type AdminStats,
  type Announcement,
  type AnnouncementLevel,
  type AuditItem,
  type FeedbackItem,
} from '../../services/operations.js'
import {
  PROFILE_SQL_PATH,
  adminDeleteUser,
  adminListUsers,
  adminSetStatus,
  formatDateTime,
  type AdminUser,
  type ProfileStatus,
} from '../../services/profile.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './AdminPanel.module.css'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'
type AdminTab = 'stats' | 'users' | 'announcements' | 'feedback' | 'audit'

/** 管理员面板：站点概览、用户、公告、反馈与审计 */
export const AdminPanel = ({
  currentUserId,
  onClose,
}: {
  currentUserId: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const [tab, setTab] = useState<AdminTab>('stats')
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const handleMissing = useCallback(() => setSchemaMissing(true), [])

  const refresh = () => setRefreshToken((value) => value + 1)

  const tabs: { value: AdminTab; label: string }[] = [
    { value: 'stats', label: t('adminTabStats') },
    { value: 'users', label: t('adminTabUsers') },
    { value: 'announcements', label: t('adminTabAnnouncements') },
    { value: 'feedback', label: t('adminTabFeedback') },
    { value: 'audit', label: t('adminTabAudit') },
  ]

  return (
    <Modal
      title={t('adminTitle')}
      className={styles.wide}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={refresh}>
            {t('adminRefresh')}
          </Button>
          <Button variant="outlined" size="m" onClick={onClose}>
            {t('close')}
          </Button>
        </>
      }
    >
      <div className={styles.panel}>
        <div className={styles.tabs}>
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              className={tab === item.value ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {schemaMissing ? (
          <div className={styles.notice}>
            <div className={styles.noticeTitle}>
              {t('profileSchemaMissing', { path: FEATURES_SQL_PATH })}
            </div>
            <div className={styles.noticeHint}>
              {t('profileSchemaMissingHint', { path: FEATURES_SQL_PATH })}
            </div>
          </div>
        ) : null}

        <div className={styles.tabPanel}>
          {tab === 'stats' ? (
            <StatsTab refreshToken={refreshToken} onSchemaMissing={handleMissing} />
          ) : null}
          {tab === 'users' ? (
            <UsersTab
              currentUserId={currentUserId}
              refreshToken={refreshToken}
              onSchemaMissing={handleMissing}
            />
          ) : null}
          {tab === 'announcements' ? (
            <AnnouncementsTab refreshToken={refreshToken} onSchemaMissing={handleMissing} />
          ) : null}
          {tab === 'feedback' ? (
            <FeedbackTab refreshToken={refreshToken} onSchemaMissing={handleMissing} />
          ) : null}
          {tab === 'audit' ? (
            <AuditTab refreshToken={refreshToken} onSchemaMissing={handleMissing} />
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------ 概览 ------------------------------ */

const StatsTab = ({
  refreshToken,
  onSchemaMissing,
}: {
  refreshToken: number
  onSchemaMissing: () => void
}) => {
  const t = useTranslate()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [stats, setStats] = useState<AdminStats | null>(null)

  useEffect(() => {
    let alive = true
    setState('loading')
    void adminStats().then((value) => {
      if (!alive) {
        return
      }
      if (!value) {
        setState('error')
        onSchemaMissing()
        return
      }
      setStats(value)
      setState('ready')
    })
    return () => {
      alive = false
    }
  }, [refreshToken, onSchemaMissing])

  if (state === 'loading') {
    return <div className={styles.hint}>{t('profileLoading')}</div>
  }
  if (state === 'error' || !stats) {
    return <div className={styles.error}>{t('adminLoadFailed')}</div>
  }

  const cards = [
    { label: t('adminStatsUsers'), value: stats.users },
    { label: t('adminStatsSessions'), value: stats.sessions },
    { label: t('adminStatsShares'), value: stats.shares },
    { label: t('adminStatsFeedback'), value: stats.feedbackOpen },
    { label: t('adminStatsAnnouncements'), value: stats.announcements },
    { label: t('adminStatsNewUsers'), value: stats.newUsers7d },
    { label: t('adminStatsActiveUsers'), value: stats.activeUsers7d },
    { label: t('adminStatsStorage'), value: formatBytes(stats.storageBytes) },
  ]

  return (
    <div className={styles.statGrid}>
      {cards.map((card) => (
        <div key={card.label} className={styles.statCard}>
          <div className={styles.statValue}>{card.value}</div>
          <div className={styles.statLabel}>{card.label}</div>
        </div>
      ))}
    </div>
  )
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/* ------------------------------ 用户 ------------------------------ */

const UsersTab = ({
  currentUserId,
  refreshToken,
  onSchemaMissing,
}: {
  currentUserId: string
  refreshToken: number
  onSchemaMissing: () => void
}) => {
  const t = useTranslate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    const result = await adminListUsers()
    if (!result.ok) {
      setUsers([])
      setLoadState(result.reason === 'schemaMissing' ? 'missing' : 'error')
      if (result.reason === 'schemaMissing') {
        onSchemaMissing()
      }
      return
    }
    setUsers(result.value)
    setLoadState('ready')
  }, [onSchemaMissing])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const toggleStatus = async (row: AdminUser) => {
    const next: ProfileStatus = row.status === 'active' ? 'disabled' : 'active'
    setPendingId(row.id)
    try {
      const result = await adminSetStatus(row.id, next)
      if (!result.ok) {
        showToast({ key: 'adminActionFailed', type: 'error' })
        return
      }
      showToast({
        key: 'adminStatusChanged',
        params: {
          username: row.username,
          status: t(next === 'active' ? 'adminStatusActive' : 'adminStatusDisabled'),
        },
      })
      await load()
    } catch {
      showToast({ key: 'adminActionFailed', type: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  const confirmDelete = async () => {
    const target = deleting
    if (!target || deletePending) {
      return
    }
    setDeletePending(true)
    try {
      const result = await adminDeleteUser(target.id)
      if (!result.ok) {
        showToast({ key: 'adminActionFailed', type: 'error' })
        return
      }
      showToast({ key: 'adminDeleted', params: { username: target.username } })
      setDeleting(null)
      await load()
    } catch {
      showToast({ key: 'adminActionFailed', type: 'error' })
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <>
      {loadState === 'loading' ? <div className={styles.hint}>{t('profileLoading')}</div> : null}
      {loadState === 'missing' ? (
        <div className={styles.notice}>
          <div className={styles.noticeTitle}>
            {t('profileSchemaMissing', { path: PROFILE_SQL_PATH })}
          </div>
        </div>
      ) : null}
      {loadState === 'error' ? <div className={styles.error}>{t('adminLoadFailed')}</div> : null}
      {loadState === 'ready' && users.length === 0 ? (
        <div className={styles.hint}>{t('adminEmpty')}</div>
      ) : null}
      {loadState === 'ready' && users.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('adminColUsername')}</th>
                <th>{t('adminColNickname')}</th>
                <th>{t('adminColStatus')}</th>
                <th>{t('adminColCreatedAt')}</th>
                <th>{t('adminColLastSignIn')}</th>
                <th className={styles.num}>{t('adminColSessions')}</th>
                <th>{t('adminColActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const self = row.id === currentUserId
                const busy = pendingId === row.id || deletePending
                return (
                  <tr key={row.id}>
                    <td>
                      <div className={styles.username}>
                        {row.username}
                        {self ? <span className={styles.selfTag}>{t('adminSelfTag')}</span> : null}
                      </div>
                      <div className={styles.email}>{row.email}</div>
                    </td>
                    <td>{row.nickname === '' ? '—' : row.nickname}</td>
                    <td>
                      <span
                        className={row.status === 'active' ? styles.badgeActive : styles.badgeDisabled}
                      >
                        {t(row.status === 'active' ? 'adminStatusActive' : 'adminStatusDisabled')}
                      </span>
                    </td>
                    <td>{formatDateTime(row.createdAt) || '—'}</td>
                    <td>{row.lastSignInAt ? formatDateTime(row.lastSignInAt) : t('adminNeverSignedIn')}</td>
                    <td className={styles.num}>{row.sessionCount}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Button
                          size="s"
                          variant="outlined"
                          disabled={self || busy}
                          onClick={() => void toggleStatus(row)}
                        >
                          {row.status === 'active' ? t('adminDisable') : t('adminEnable')}
                        </Button>
                        <Button
                          size="s"
                          variant="dangerOutlined"
                          disabled={self || busy}
                          onClick={() => setDeleting(row)}
                        >
                          {t('adminDelete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {deleting ? (
        <Modal
          title={t('adminDeleteTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button
                variant="outlined"
                size="m"
                disabled={deletePending}
                onClick={() => setDeleting(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                size="m"
                disabled={deletePending}
                onClick={() => void confirmDelete()}
              >
                {deletePending ? t('adminDeleting') : t('adminDeleteConfirm')}
              </Button>
            </>
          }
        >
          <div className={styles.confirm}>
            {t('adminDeleteContent', { username: deleting.username, count: deleting.sessionCount })}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

/* ------------------------------ 公告 ------------------------------ */

const EMPTY_ANNOUNCEMENT = {
  id: null as string | null,
  title: '',
  body: '',
  level: 'info' as AnnouncementLevel,
  active: true,
  expiresAt: '',
}

const AnnouncementsTab = ({
  refreshToken,
  onSchemaMissing,
}: {
  refreshToken: number
  onSchemaMissing: () => void
}) => {
  const t = useTranslate()
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<typeof EMPTY_ANNOUNCEMENT | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await adminListAnnouncements()
    setItems(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  useEffect(() => {
    // 首次加载失败（表不存在）时给出初始化提示
    if (!loading && items.length === 0) {
      void adminStats().then((value) => {
        if (!value) {
          onSchemaMissing()
        }
      })
    }
  }, [loading, items.length, onSchemaMissing])

  const save = async () => {
    if (!draft || saving) {
      return
    }
    if (draft.title.trim() === '') {
      showToast({ key: 'announcementTitleRequired', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const ok = await adminSaveAnnouncement({
        id: draft.id,
        title: draft.title.trim(),
        body: draft.body.trim(),
        level: draft.level,
        active: draft.active,
        expiresAt: draft.expiresAt === '' ? null : new Date(draft.expiresAt).toISOString(),
      })
      if (!ok) {
        showToast({ key: 'adminActionFailed', type: 'error' })
        return
      }
      showToast({ key: 'announcementSaved' })
      setDraft(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id)
      return
    }
    const ok = await adminDeleteAnnouncement(id)
    setDeletingId(null)
    if (ok) {
      showToast({ key: 'announcementDeleted' })
      await load()
    } else {
      showToast({ key: 'adminActionFailed', type: 'error' })
    }
  }

  return (
    <div className={styles.stack}>
      <div className={styles.rowBetween}>
        <div className={styles.sectionHint}>{t('announcementHint')}</div>
        <Button size="s" onClick={() => setDraft({ ...EMPTY_ANNOUNCEMENT })}>
          {t('announcementNew')}
        </Button>
      </div>

      {draft ? (
        <div className={styles.formCard}>
          <label className={styles.formField}>
            <span>{t('announcementTitleLabel')}</span>
            <input
              className={styles.formInput}
              value={draft.title}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className={styles.formField}>
            <span>{t('announcementBodyLabel')}</span>
            <textarea
              className={styles.formTextarea}
              rows={3}
              maxLength={1000}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.formField}>
              <span>{t('announcementLevel')}</span>
              <select
                className={styles.formInput}
                value={draft.level}
                onChange={(event) =>
                  setDraft({ ...draft, level: event.target.value as AnnouncementLevel })
                }
              >
                <option value="info">{t('announcementLevelInfo')}</option>
                <option value="warning">{t('announcementLevelWarning')}</option>
                <option value="success">{t('announcementLevelSuccess')}</option>
              </select>
            </label>
            <label className={styles.formField}>
              <span>{t('announcementExpires')}</span>
              <input
                className={styles.formInput}
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
              />
            </label>
            <label className={styles.formCheck}>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
              />
              {t('announcementActive')}
            </label>
          </div>
          <div className={styles.rowActions}>
            <Button size="s" disabled={saving} onClick={() => void save()}>
              {saving ? t('profileSaving') : t('save')}
            </Button>
            <Button size="s" variant="outlined" disabled={saving} onClick={() => setDraft(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? <div className={styles.hint}>{t('profileLoading')}</div> : null}
      {!loading && items.length === 0 ? <div className={styles.hint}>{t('announcementEmpty')}</div> : null}
      {items.map((item) => (
        <div key={item.id} className={styles.listRow}>
          <div className={styles.listMain}>
            <div className={styles.listTitle}>
              {item.title}
              <span className={styles.listTag}>
                {t(
                  item.level === 'warning'
                    ? 'announcementLevelWarning'
                    : item.level === 'success'
                      ? 'announcementLevelSuccess'
                      : 'announcementLevelInfo'
                )}
              </span>
              {!item.active ? <span className={styles.listTag}>{t('announcementInactive')}</span> : null}
            </div>
            <div className={styles.listMeta}>
              {formatDateTime(item.createdAt)}
              {item.expiresAt ? ` · ${t('announcementExpires')} ${formatDateTime(item.expiresAt)}` : ''}
            </div>
            {item.body ? <div className={styles.listBody}>{item.body}</div> : null}
          </div>
          <div className={styles.rowActions}>
            <Button
              size="s"
              variant="outlined"
              onClick={() =>
                setDraft({
                  id: item.id,
                  title: item.title,
                  body: item.body,
                  level: item.level,
                  active: item.active,
                  expiresAt: item.expiresAt ? toLocalInput(item.expiresAt) : '',
                })
              }
            >
              {t('edit')}
            </Button>
            <Button size="s" variant="dangerOutlined" onClick={() => void remove(item.id)}>
              {deletingId === item.id ? t('adminDeleteConfirm') : t('adminDelete')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** ISO 时间 → datetime-local 需要的本地时间字符串 */
const toLocalInput = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ------------------------------ 反馈 ------------------------------ */

const FeedbackTab = ({
  refreshToken,
  onSchemaMissing,
}: {
  refreshToken: number
  onSchemaMissing: () => void
}) => {
  const t = useTranslate()
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [filter, setFilter] = useState<'' | 'open' | 'resolved'>('open')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await adminListFeedback(filter)
    setItems(list)
    setLoading(false)
  }, [filter])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  useEffect(() => {
    if (!loading && items.length === 0) {
      void adminStats().then((value) => {
        if (!value) {
          onSchemaMissing()
        }
      })
    }
  }, [loading, items.length, onSchemaMissing])

  const setStatus = async (item: FeedbackItem, status: 'open' | 'resolved') => {
    const ok = await adminSetFeedbackStatus(item.id, status)
    if (ok) {
      await load()
    } else {
      showToast({ key: 'adminActionFailed', type: 'error' })
    }
  }

  const remove = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id)
      return
    }
    const ok = await adminDeleteFeedback(id)
    setDeletingId(null)
    if (ok) {
      await load()
    } else {
      showToast({ key: 'adminActionFailed', type: 'error' })
    }
  }

  return (
    <div className={styles.stack}>
      <div className={styles.filterRow}>
        {(
          [
            { value: '', label: t('feedbackFilterAll') },
            { value: 'open', label: t('feedbackStatusOpen') },
            { value: 'resolved', label: t('feedbackStatusResolved') },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? `${styles.filter} ${styles.filterActive}` : styles.filter}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? <div className={styles.hint}>{t('profileLoading')}</div> : null}
      {!loading && items.length === 0 ? <div className={styles.hint}>{t('feedbackAdminEmpty')}</div> : null}
      {items.map((item) => (
        <div key={item.id} className={styles.listRow}>
          <div className={styles.listMain}>
            <div className={styles.listTitle}>
              {item.username || t('feedbackAnonymous')}
              <span className={styles.listTag}>
                {t(item.status === 'open' ? 'feedbackStatusOpen' : 'feedbackStatusResolved')}
              </span>
            </div>
            <div className={styles.listMeta}>
              {formatDateTime(item.createdAt)}
              {item.contact ? ` · ${item.contact}` : ''}
              {item.page ? ` · ${item.page}` : ''}
            </div>
            <div className={styles.listBody}>{item.content}</div>
          </div>
          <div className={styles.rowActions}>
            <Button
              size="s"
              variant="outlined"
              onClick={() => void setStatus(item, item.status === 'open' ? 'resolved' : 'open')}
            >
              {t(item.status === 'open' ? 'feedbackResolve' : 'feedbackReopen')}
            </Button>
            <Button size="s" variant="dangerOutlined" onClick={() => void remove(item.id)}>
              {deletingId === item.id ? t('adminDeleteConfirm') : t('adminDelete')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ 审计 ------------------------------ */

const AuditTab = ({
  refreshToken,
  onSchemaMissing,
}: {
  refreshToken: number
  onSchemaMissing: () => void
}) => {
  const t = useTranslate()
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void adminListAudit(200).then((list) => {
      if (!alive) {
        return
      }
      setItems(list)
      setLoading(false)
      if (list.length === 0) {
        void adminStats().then((value) => {
          if (!value) {
            onSchemaMissing()
          }
        })
      }
    })
    return () => {
      alive = false
    }
  }, [refreshToken, onSchemaMissing])

  if (loading) {
    return <div className={styles.hint}>{t('profileLoading')}</div>
  }
  if (items.length === 0) {
    return <div className={styles.hint}>{t('auditEmpty')}</div>
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('auditColTime')}</th>
            <th>{t('auditColActor')}</th>
            <th>{t('auditColAction')}</th>
            <th>{t('auditColTarget')}</th>
            <th>{t('auditColDetail')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDateTime(item.createdAt)}</td>
              <td>{item.actorName || '—'}</td>
              <td>{item.action}</td>
              <td className={styles.auditTarget}>{item.target || '—'}</td>
              <td className={styles.auditDetail}>{item.detail || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
