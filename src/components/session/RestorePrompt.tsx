import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { selectSession, useChatStore } from '../../services/chat/store.js'
import { readLastSession, requestRestorePosition } from '../../services/chat/sessionMemory.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import styles from './RestorePrompt.module.css'

/**
 * 重新打开网页时在页面中间贴一张小卡片，询问是否回到上次的聊天与阅读位置。
 * 不铺满全屏、不阻塞侧栏，忽略后本次不再出现。
 */
export const RestorePrompt = () => {
  const t = useTranslate()
  const ready = useChatStore((state) => state.ready)
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const restoreMode = useSettings((state) => state.restoreMode)
  const [target, setTarget] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (!ready || resolved || activeId !== null) {
      return
    }
    const last = readLastSession()
    setResolved(true)
    if (!last || !sessions.some((item) => item.id === last) || restoreMode === 'off') {
      return
    }
    if (restoreMode === 'always') {
      requestRestorePosition(last)
      selectSession(last)
      return
    }
    setTarget(last)
  }, [ready, resolved, activeId, sessions, restoreMode])

  if (target === null) {
    return null
  }

  const title = sessions.find((item) => item.id === target)?.title ?? ''

  return (
    <div className={styles.root} role="dialog" aria-label={t('restoreTitle')}>
      <div className={styles.title}>{t('restoreTitle')}</div>
      <div className={styles.body}>{t('restoreBody')}</div>
      {title ? <div className={styles.session}>{title}</div> : null}
      <div className={styles.actions}>
        <Button variant="outlined" size="s" onClick={() => setTarget(null)}>
          {t('restoreDismiss')}
        </Button>
        <Button
          variant="primary"
          size="s"
          onClick={() => {
            requestRestorePosition(target)
            selectSession(target)
            setTarget(null)
          }}
        >
          {t('restoreOpen')}
        </Button>
      </div>
    </div>
  )
}
