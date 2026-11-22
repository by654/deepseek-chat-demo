import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { signOut, useAccount } from '../../services/account.js'
import { syncAll, useSync } from '../../services/sync/cloudSync.js'
import type { SyncProgress } from '../../services/sync/cloudSync.js'
import { showToast } from '../base/toastState.js'
import { AuthDialog } from './AuthDialog.js'
import styles from './AccountSection.module.css'

/** 带百分比的进度条 + 「已完成/总数」文案 */
const SyncProgressBar = ({ progress, label }: { progress: SyncProgress; label: string }) => {
  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 100
  return (
    <div className={styles.progress}>
      <div className={styles.progressLabel}>
        <span className={styles.progressText}>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/** 上次同步时间：今天只显示时分，更早显示「月-日 时:分」 */
const formatSyncTime = (at: number): string => {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === new Date().toDateString()) {
    return time
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

/** 侧边栏底部账号区：未登录显示入口，登录后显示用户名、单一「同步」按钮、进度与同步状态 */
export const AccountSection = () => {
  const t = useTranslate()
  const ready = useAccount((state) => state.ready)
  const user = useAccount((state) => state.user)
  const progress = useSync((state) => state.progress)
  const lastSyncAt = useSync((state) => state.lastSyncAt)
  const pendingCount = useSync((state) => state.pendingCount)
  const [authOpen, setAuthOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleSync = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      const result = await syncAll()
      if (result.error) {
        // 把失败阶段与服务端错误码一起展示，避免只看到笼统的「同步失败」
        showToast({
          key: 'syncFailedDetail',
          params: {
            message: result.error.code
              ? `${result.error.message} (${result.error.code})`
              : result.error.message,
            uploaded: result.uploaded,
          },
          type: 'error',
        })
      } else if (result.failed > 0) {
        showToast({
          key: 'syncSummaryFailed',
          params: {
            downloaded: result.downloaded,
            uploaded: result.uploaded,
            skipped: result.skipped,
            failed: result.failed,
          },
          type: 'error',
        })
      } else {
        showToast({
          key: 'syncSummary',
          params: {
            downloaded: result.downloaded,
            uploaded: result.uploaded,
            skipped: result.skipped,
          },
        })
      }
    } catch {
      showToast({ key: 'syncFailed', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return null
  }

  if (!user) {
    return (
      <div className={styles.account}>
        <button type="button" className={styles.signIn} onClick={() => setAuthOpen(true)}>
          {t('accountSignIn')}
        </button>
        {authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}
      </div>
    )
  }

  const syncing = busy || progress !== null
  const label = progress
    ? progress.phase === 'pull'
      ? t('syncDownloadingProgress', { done: progress.done, total: progress.total })
      : t('syncUploadingProgress', { done: progress.done, total: progress.total })
    : null

  return (
    <div className={styles.account}>
      <div className={styles.userRow}>
        <span className={styles.avatar}>{user.username.slice(0, 1).toUpperCase()}</span>
        <span className={styles.username} title={user.username}>
          {user.username}
        </span>
        <button
          type="button"
          className={styles.signOut}
          onClick={async () => {
            await signOut()
            showToast({ key: 'authSignOutSuccess' })
          }}
        >
          {t('accountSignOut')}
        </button>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={syncing}
          onClick={() => void handleSync()}
        >
          {syncing ? t('syncing') : t('syncNow')}
        </button>
      </div>
      {progress && label ? <SyncProgressBar progress={progress} label={label} /> : null}
      <div className={styles.meta}>
        <span className={styles.metaText}>
          {lastSyncAt ? t('syncLastAt', { time: formatSyncTime(lastSyncAt) }) : t('syncNeverSynced')}
        </span>
        {pendingCount > 0 ? (
          <span className={styles.pending} title={t('syncPendingCount', { count: pendingCount })}>
            {t('syncPendingCount', { count: pendingCount })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
