import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { refreshMfaState, signOut, useAccount } from '../../services/account.js'
import { verifyTotp } from '../../services/mfa.js'
import { Button } from '../base/Button.js'
import styles from './MfaGate.module.css'

/** 登录后的 AAL2 门禁：账号已绑定验证器且本次登录未校验时，阻止进入主界面 */
export const MfaGate = () => {
  const t = useTranslate()
  const user = useAccount((state) => state.user)
  const required = useAccount((state) => state.mfaRequired)
  const factorId = useAccount((state) => state.mfaFactorId)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  if (!user || !required || !factorId) {
    return null
  }

  const submit = async () => {
    if (busy || code.length < 6) {
      return
    }
    setBusy(true)
    setError(false)
    try {
      const ok = await verifyTotp(factorId, code)
      if (!ok) {
        setError(true)
        setCode('')
        return
      }
      await refreshMfaState()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <div className={styles.title}>{t('mfaGateTitle')}</div>
        <div className={styles.hint}>{t('mfaGateHint')}</div>
        <input
          className={styles.input}
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={code}
          placeholder="000000"
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, ''))
            setError(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void submit()
            }
          }}
        />
        {error ? <div className={styles.error}>{t('mfaWrongCode')}</div> : null}
        <Button size="m" disabled={busy || code.length < 6} onClick={() => void submit()}>
          {busy ? t('mfaVerifying') : t('mfaVerify')}
        </Button>
        <button
          type="button"
          className={styles.signOut}
          onClick={() => {
            void signOut()
          }}
        >
          {t('accountSignOut')}
        </button>
      </div>
    </div>
  )
}
