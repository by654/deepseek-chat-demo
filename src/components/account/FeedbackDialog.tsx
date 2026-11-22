import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { submitFeedback } from '../../services/operations.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './FeedbackDialog.module.css'

/** 意见反馈：登录用户提交到 Supabase，管理员在用户管理面板查看 */
export const FeedbackDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (content.trim() === '') {
      setError(t('feedbackEmpty'))
      return
    }
    if (busy) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const ok = await submitFeedback(
        content.trim(),
        contact.trim(),
        window.location.pathname + window.location.search
      )
      if (!ok) {
        showToast({ key: 'feedbackFailed', type: 'error' })
        return
      }
      showToast({ key: 'feedbackDone' })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('feedbackTitle')}
      closable
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="m" disabled={busy} onClick={() => void submit()}>
            {busy ? t('feedbackSubmitting') : t('feedbackSubmit')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t('feedbackContentLabel')}</span>
          <textarea
            className={styles.textarea}
            rows={5}
            maxLength={4000}
            value={content}
            placeholder={t('feedbackContentPlaceholder')}
            onChange={(event) => {
              setContent(event.target.value)
              setError('')
            }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('feedbackContactLabel')}</span>
          <input
            className={styles.input}
            value={contact}
            maxLength={120}
            placeholder={t('feedbackContactPlaceholder')}
            onChange={(event) => setContact(event.target.value)}
          />
        </label>
        {error ? <div className={styles.error}>{error}</div> : null}
      </div>
    </Modal>
  )
}
