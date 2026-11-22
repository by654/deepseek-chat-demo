import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import type { TranslationKey } from '../../i18n/index.js'
import { signIn, signUp } from '../../services/account.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './AuthDialog.module.css'

/** 登录 / 注册弹窗：只需要用户名 + 密码，注册成功即登录 */
export const AuthDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const formId = useId()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (pending) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const failure =
        mode === 'signIn'
          ? await signIn(username, password)
          : await signUp(username, password)
      if (failure) {
        setError(failure)
        return
      }
      showToast({ key: mode === 'signIn' ? 'authSignInSuccess' : 'authSignUpSuccess' })
      onClose()
    } catch {
      setError('authErrorNetwork')
    } finally {
      setPending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn')
    setError(null)
  }

  return (
    <Modal
      title={t(mode === 'signIn' ? 'authSignInTitle' : 'authSignUpTitle')}
      onClose={() => {
        if (!pending) {
          onClose()
        }
      }}
      footer={
        <>
          <Button variant="outlined" disabled={pending} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {t(mode === 'signIn' ? 'authSubmitSignIn' : 'authSubmitSignUp')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>{t('authUsernameLabel')}</span>
          <input
            className={styles.input}
            value={username}
            autoFocus
            autoComplete="username"
            placeholder={t('authUsernamePlaceholder')}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('authPasswordLabel')}</span>
          <input
            className={styles.input}
            type="password"
            value={password}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            placeholder={t('authPasswordPlaceholder')}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        {error ? <div className={styles.error}>{t(error)}</div> : null}
        <button type="button" className={styles.switch} onClick={switchMode}>
          {t(mode === 'signIn' ? 'authSwitchToSignUp' : 'authSwitchToSignIn')}
        </button>
      </form>
    </Modal>
  )
}
