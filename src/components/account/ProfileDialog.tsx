import { useEffect, useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import type { AccountUser } from '../../services/account.js'
import {
  enrollTotp,
  listMfaFactors,
  unenrollTotp,
  verifyTotpEnrollment,
  type MfaFactor,
} from '../../services/mfa.js'
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PROFILE_SQL_PATH,
  fetchProfile,
  saveNickname,
  updatePassword,
  type Profile,
} from '../../services/profile.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './ProfileDialog.module.css'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'

/** 个人资料弹窗：用户名只读、昵称可保存、修改密码不需输入当前密码 */
export const ProfileDialog = ({ user, onClose }: { user: AccountUser; onClose: () => void }) => {
  const t = useTranslate()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<TranslationKey | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [factors, setFactors] = useState<MfaFactor[]>([])
  const [enrollment, setEnrollment] = useState<{
    factorId: string
    qrCode: string
    secret: string
  } | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState<'disabled' | 'wrong' | 'failed' | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const result = await fetchProfile(user.id)
      if (!alive) {
        return
      }
      if (!result.ok) {
        setLoadState(result.reason === 'schemaMissing' ? 'missing' : 'error')
        return
      }
      const value = result.value
      setProfile(value)
      setNickname(value ? value.nickname || value.username : '')
      setLoadState('ready')
    }
    void load()
    void listMfaFactors().then((list) => {
      if (alive) {
        setFactors(list)
      }
    })
    return () => {
      alive = false
    }
  }, [user.id])

  const submitNickname = async () => {
    const trimmed = nickname.trim()
    if (trimmed === '' || trimmed.length > NICKNAME_MAX_LENGTH) {
      showToast({ key: 'profileNicknameInvalid', type: 'error' })
      return
    }
    if (savingNickname) {
      return
    }
    setSavingNickname(true)
    try {
      const result = await saveNickname(trimmed)
      if (!result.ok) {
        if (result.reason === 'schemaMissing') {
          setLoadState('missing')
          showToast({ key: 'profileSchemaMissing', params: { path: PROFILE_SQL_PATH }, type: 'error' })
          return
        }
        showToast({ key: 'profileSaveFailed', type: 'error' })
        return
      }
      setProfile(result.value)
      setNickname(result.value.nickname)
      showToast({ key: 'profileSaved' })
    } catch {
      showToast({ key: 'profileSaveFailed', type: 'error' })
    } finally {
      setSavingNickname(false)
    }
  }

  const submitPassword = async () => {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError('profilePasswordTooShort')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('profilePasswordMismatch')
      return
    }
    if (savingPassword) {
      return
    }
    setPasswordError(null)
    setSavingPassword(true)
    try {
      const result = await updatePassword(newPassword)
      if (!result.ok) {
        const key: TranslationKey =
          result.reason === 'network' ? 'authErrorNetwork' : 'profilePasswordFailed'
        setPasswordError(key)
        showToast({ key, type: 'error' })
        return
      }
      setNewPassword('')
      setConfirmPassword('')
      showToast({ key: 'profilePasswordUpdated' })
    } catch {
      setPasswordError('profilePasswordFailed')
      showToast({ key: 'profilePasswordFailed', type: 'error' })
    } finally {
      setSavingPassword(false)
    }
  }

  const displayUsername = profile && profile.username !== '' ? profile.username : user.username

  const startEnroll = async () => {
    setMfaError(null)
    setMfaBusy(true)
    try {
      const result = await enrollTotp()
      if (!result.ok) {
        setMfaError(result.reason)
        return
      }
      setEnrollment({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret })
    } finally {
      setMfaBusy(false)
    }
  }

  const confirmEnroll = async () => {
    if (!enrollment || mfaBusy) {
      return
    }
    setMfaBusy(true)
    try {
      if (!(await verifyTotpEnrollment(enrollment.factorId, mfaCode))) {
        setMfaError('wrong')
        setMfaCode('')
        return
      }
      setEnrollment(null)
      setMfaCode('')
      setMfaError(null)
      setFactors(await listMfaFactors())
      showToast({ key: 'mfaEnabled' })
    } finally {
      setMfaBusy(false)
    }
  }

  const cancelEnroll = async () => {
    if (enrollment) {
      await unenrollTotp(enrollment.factorId)
    }
    setEnrollment(null)
    setMfaCode('')
    setMfaError(null)
  }

  const removeFactor = async (factorId: string) => {
    if (mfaBusy) {
      return
    }
    setMfaBusy(true)
    try {
      if (await unenrollTotp(factorId)) {
        setFactors(await listMfaFactors())
        showToast({ key: 'mfaDisabled' })
      } else {
        showToast({ key: 'adminActionFailed', type: 'error' })
      }
    } finally {
      setMfaBusy(false)
    }
  }

  return (
    <Modal
      title={t('profileTitle')}
      onClose={onClose}
      footer={
        <Button variant="outlined" onClick={onClose}>
          {t('close')}
        </Button>
      }
    >
      <div className={styles.form}>
        {loadState === 'loading' ? <div className={styles.hint}>{t('profileLoading')}</div> : null}

        {loadState === 'missing' ? (
          <div className={styles.notice}>
            <div className={styles.noticeTitle}>{t('profileSchemaMissing', { path: PROFILE_SQL_PATH })}</div>
            <div className={styles.noticeHint}>{t('profileSchemaMissingHint', { path: PROFILE_SQL_PATH })}</div>
          </div>
        ) : null}

        {loadState === 'error' ? <div className={styles.error}>{t('profileLoadFailed')}</div> : null}

        {loadState === 'ready' ? (
          <>
            <label className={styles.field}>
              <span className={styles.label}>{t('profileUsernameLabel')}</span>
              <input className={styles.input} value={displayUsername} readOnly disabled />
              <span className={styles.hint}>{t('profileUsernameHint')}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t('profileNicknameLabel')}</span>
              <input
                className={styles.input}
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder={t('profileNicknamePlaceholder')}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>

            <div className={styles.row}>
              <Button size="m" disabled={savingNickname} onClick={() => void submitNickname()}>
                {savingNickname ? t('profileSaving') : t('profileSaveNickname')}
              </Button>
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionTitle}>{t('profilePasswordSection')}</div>

            <label className={styles.field}>
              <span className={styles.label}>{t('profileNewPasswordLabel')}</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                placeholder={t('profileNewPasswordPlaceholder')}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  setPasswordError(null)
                }}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t('profileConfirmPasswordLabel')}</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                placeholder={t('profileConfirmPasswordPlaceholder')}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setPasswordError(null)
                }}
              />
            </label>

            {passwordError ? <div className={styles.error}>{t(passwordError)}</div> : null}

            <div className={styles.row}>
              <Button size="m" disabled={savingPassword} onClick={() => void submitPassword()}>
                {savingPassword ? t('profileUpdating') : t('profileUpdatePassword')}
              </Button>
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionTitle}>{t('mfaSection')}</div>
            <div className={styles.hint}>{t('mfaHint')}</div>

            {factors.map((factor) => (
              <div key={factor.id} className={styles.row}>
                <span className={styles.hint}>
                  {factor.friendlyName || t('mfaNameFallback')} · {t('mfaStatusOn')}
                </span>
                <Button
                  size="s"
                  variant="outlined"
                  disabled={mfaBusy}
                  onClick={() => void removeFactor(factor.id)}
                >
                  {t('mfaRemove')}
                </Button>
              </div>
            ))}

            {enrollment ? (
              <div className={styles.mfaEnroll}>
                <img className={styles.qr} src={enrollment.qrCode} alt="TOTP QR" />
                <div className={styles.hint}>{t('mfaScanHint')}</div>
                <div className={styles.secret}>
                  {t('mfaSecret')}：<code>{enrollment.secret}</code>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>{t('mfaCodeLabel')}</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    placeholder="000000"
                    onChange={(event) => {
                      setMfaCode(event.target.value.replace(/\D/g, ''))
                      setMfaError(null)
                    }}
                  />
                </label>
                <div className={styles.row}>
                  <Button size="m" disabled={mfaBusy || mfaCode.length < 6} onClick={() => void confirmEnroll()}>
                    {mfaBusy ? t('mfaVerifying') : t('mfaVerify')}
                  </Button>
                  <Button size="m" variant="outlined" disabled={mfaBusy} onClick={() => void cancelEnroll()}>
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            ) : factors.length === 0 ? (
              <div className={styles.row}>
                <Button size="m" disabled={mfaBusy} onClick={() => void startEnroll()}>
                  {mfaBusy ? t('mfaVerifying') : t('mfaEnable')}
                </Button>
              </div>
            ) : null}

            {mfaError ? (
              <div className={styles.error}>
                {t(
                  mfaError === 'disabled'
                    ? 'mfaDisabledHint'
                    : mfaError === 'wrong'
                      ? 'mfaWrongCode'
                      : 'mfaEnrollFailed'
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  )
}
