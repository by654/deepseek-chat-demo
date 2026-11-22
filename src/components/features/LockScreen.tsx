import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { lockNow, markActive, unlock, useLock } from '../../services/security.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { IconLockOutline16 } from './icons.js'
import styles from './features.module.css'

const LAST_ACTIVE_KEY = 'chat-demo:last-active'

const readLastActive = () => {
  const value = Number(localStorage.getItem(LAST_ACTIVE_KEY))
  return Number.isFinite(value) ? value : 0
}

/** 本地数据锁屏：设置 PIN 后，空闲超时或重新打开页面时要求解锁。 */
export const LockScreen = () => {
  const t = useTranslate()
  const locked = useLock((state) => state.locked)
  const lockPinHash = useSettings((state) => state.lockPinHash)
  const timeoutMinutes = useSettings((state) => state.lockTimeoutMinutes)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef<number>()

  useEffect(() => {
    if (!lockPinHash) {
      return
    }
    const timeout = timeoutMinutes * 60_000
    const last = readLastActive()
    if (last && Date.now() - last > timeout) {
      lockNow()
    }

    let throttle = 0
    const activity = () => {
      const now = Date.now()
      markActive()
      if (now - throttle > 5_000) {
        throttle = now
        try {
          localStorage.setItem(LAST_ACTIVE_KEY, String(now))
        } catch {
          // 忽略
        }
      }
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (useSettings.getState().lockPinHash) {
          lockNow()
        }
      }, timeout)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        try {
          localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
        } catch {
          // 忽略
        }
      } else if (Date.now() - readLastActive() > timeout) {
        lockNow()
      } else {
        activity()
      }
    }
    activity()
    for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
      window.addEventListener(event, activity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timerRef.current)
      for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
        window.removeEventListener(event, activity)
      }
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [lockPinHash, timeoutMinutes])

  if (!locked || !lockPinHash) {
    return null
  }

  const submit = async () => {
    if (busy || !pin.trim()) {
      return
    }
    setBusy(true)
    setError(false)
    try {
      if (await unlock(pin)) {
        setPin('')
        try {
          localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
        } catch {
          // 忽略
        }
      } else {
        setError(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className={styles.lockScreen} role="dialog" aria-modal="true" aria-label="界面已锁定">
      <div className={styles.lockCard}>
        <div className={styles.lockIcon}>
          <IconLockOutline16 />
        </div>
        <div className={styles.lockTitle}>界面已锁定</div>
        <div className={styles.lockHint}>输入 PIN 继续使用本机会话与素材</div>
        <input
          className={styles.pinInput}
          type="password"
          inputMode="numeric"
          autoFocus
          maxLength={8}
          value={pin}
          aria-label="PIN"
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, ''))
            setError(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {error ? <div className={styles.lockError}>PIN 不正确，请重试</div> : null}
        <Button block size="m" disabled={busy || !pin.trim()} onClick={() => void submit()}>
          {busy ? '解锁中…' : t('confirm')}
        </Button>
      </div>
    </div>,
    document.body
  )
}
