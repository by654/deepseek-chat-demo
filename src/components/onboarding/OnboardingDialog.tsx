import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { setApiKey, setNickname, setOnboardingDone, useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './Onboarding.module.css'

/**
 * 首次打开时的引导：填 API Key 与称呼后即可开始，取代原先的数据管理弹窗。
 * 「稍后」只关闭本次引导，下次打开仍会出现。
 */
export const OnboardingDialog = () => {
  const t = useTranslate()
  const [apiKey, setApiKeyDraft] = useState(() => useSettings.getState().apiKey ?? '')
  const [nickname, setNicknameDraft] = useState(() => useSettings.getState().nickname)
  const [dismissed, setDismissed] = useState(false)
  const done = useSettings((state) => state.onboardingDone)

  if (done || dismissed) {
    return null
  }

  const finish = () => {
    const trimmedKey = apiKey.trim()
    const trimmedName = nickname.trim()
    if (trimmedKey) {
      setApiKey(trimmedKey)
    }
    setNickname(trimmedName)
    setOnboardingDone(true)
    if (!trimmedKey) {
      showToast(t('onboardingKeyMissing'))
    }
  }

  return (
    <Modal
      title={t('onboardingTitle')}
      className={styles.dialog}
      closable
      onClose={() => setDismissed(true)}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={() => setDismissed(true)}>
            {t('onboardingLater')}
          </Button>
          <Button variant="primary" size="m" onClick={finish}>
            {t('onboardingStart')}
          </Button>
        </>
      }
    >
      <p className={styles.subtitle}>{t('onboardingSubtitle')}</p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('onboardingApi')}</span>
        <input
          type="password"
          className={styles.input}
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-..."
          onChange={(event) => setApiKeyDraft(event.target.value)}
        />
        <span className={styles.fieldHint}>{t('onboardingApiHint')}</span>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('onboardingName')}</span>
        <input
          type="text"
          className={styles.input}
          value={nickname}
          maxLength={24}
          placeholder={t('onboardingNameHint')}
          onChange={(event) => setNicknameDraft(event.target.value)}
        />
      </label>
    </Modal>
  )
}
