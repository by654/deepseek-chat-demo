import { useCallback, useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useAccount } from '../../services/account.js'
import type { Session } from '../../services/chat/types.js'
import {
  createShare,
  listMyShares,
  revokeShare,
  shareUrl,
  type MyShare,
} from '../../services/share.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './features.module.css'

/** 有效期选项：值是天数，0 表示永久 */
const EXPIRY_OPTIONS = [
  { days: 0, label: 'shareExpiryNever' },
  { days: 1, label: 'shareExpiry1d' },
  { days: 7, label: 'shareExpiry7d' },
  { days: 30, label: 'shareExpiry30d' },
] as const

const expiryToIso = (days: number): string | null =>
  days === 0 ? null : new Date(Date.now() + days * 86_400_000).toISOString()

const formatDate = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 分享会话：创建只读链接（可选密码与有效期），并管理已创建的分享 */
export const ShareDialog = ({ session, onClose }: { session: Session; onClose: () => void }) => {
  const t = useTranslate()
  const user = useAccount((state) => state.user)
  const [password, setPassword] = useState('')
  const [expiryDays, setExpiryDays] = useState(0)
  const [creating, setCreating] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [shares, setShares] = useState<MyShare[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setShares([])
      return
    }
    setLoading(true)
    try {
      setShares(await listMyShares())
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(id))
      showToast({ key: 'shareCopied' })
    } catch {
      showToast({ key: 'shareCopyFailed', type: 'error' })
    }
  }

  const submit = async () => {
    if (!user) {
      showToast({ key: 'shareLoginRequired', type: 'error' })
      return
    }
    if (creating) {
      return
    }
    setCreating(true)
    try {
      const result = await createShare(session, {
        password,
        expiresAt: expiryToIso(expiryDays),
      })
      if (!result.ok) {
        const key =
          result.reason === 'tooLarge'
            ? 'shareTooLarge'
            : result.reason === 'login'
              ? 'shareLoginRequired'
              : 'shareFailed'
        showToast({ key, type: 'error' })
        return
      }
      setCreatedId(result.id)
      showToast({ key: 'shareCreated' })
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    if (await revokeShare(id)) {
      showToast({ key: 'shareRevoked' })
      setShares((current) => current.map((item) => (item.id === id ? { ...item, revoked: true } : item)))
    } else {
      showToast({ key: 'shareFailed', type: 'error' })
    }
  }

  return (
    <Modal
      title={t('shareDialogTitle')}
      closable
      className={styles.snapshotModal}
      onClose={onClose}
      footer={
        <Button variant="outlined" size="s" onClick={onClose}>
          {t('close')}
        </Button>
      }
    >
      <div className={styles.share}>
        {!user ? <div className={styles.shareNotice}>{t('shareLoginRequired')}</div> : null}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('sharePasswordLabel')}</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder={t('sharePasswordPlaceholder')}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('shareExpiryLabel')}</span>
          <select
            className={styles.selectNative}
            value={expiryDays}
            onChange={(event) => setExpiryDays(Number(event.target.value))}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.row}>
          <Button size="s" disabled={creating || !user} onClick={() => void submit()}>
            {creating ? t('shareCreating') : t('shareCreate')}
          </Button>
        </div>

        {createdId ? (
          <div className={styles.shareCreated}>
            <div className={styles.fieldLabel}>{t('shareLinkLabel')}</div>
            <div className={styles.shareLinkRow}>
              <input className={styles.shareLinkInput} readOnly value={shareUrl(createdId)} />
              <Button size="s" variant="outlined" onClick={() => void copyLink(createdId)}>
                {t('shareCopy')}
              </Button>
              <Button
                size="s"
                variant="outlined"
                onClick={() => window.open(shareUrl(createdId), '_blank', 'noopener')}
              >
                {t('shareOpen')}
              </Button>
            </div>
          </div>
        ) : null}

        <div className={styles.shareSectionTitle}>{t('shareMyShares')}</div>
        {loading ? <div className={styles.empty}>{t('shareLoading')}</div> : null}
        {!loading && user && shares.length === 0 ? (
          <div className={styles.empty}>{t('shareEmpty')}</div>
        ) : null}
        <div className={styles.list}>
          {shares.map((item) => {
            const expired =
              item.expiresAt !== null && new Date(item.expiresAt).getTime() <= Date.now()
            const inactive = item.revoked || expired
            return (
              <div key={item.id} className={styles.shareRow}>
                <div className={styles.snapshotMain}>
                  <div className={styles.snapshotTitle}>{item.title || t('shareDialogTitle')}</div>
                  <div className={styles.snapshotMeta}>
                    {formatDate(item.createdAt)} · {t('shareViews', { count: item.views })}
                    {item.hasPassword ? ` · ${t('shareHasPassword')}` : ''}
                    {inactive ? ` · ${t(expired ? 'shareExpired' : 'shareRevokedShort')}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.chip}
                  disabled={inactive}
                  onClick={() => void copyLink(item.id)}
                >
                  {t('shareCopy')}
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  disabled={inactive}
                  onClick={() => void revoke(item.id)}
                >
                  {t('shareRevoke')}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
