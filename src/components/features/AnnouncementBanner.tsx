import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { listActiveAnnouncements, type Announcement } from '../../services/operations.js'
import styles from './AnnouncementBanner.module.css'

const STORAGE_KEY = 'chat-demo:closed-announcements'

const readClosed = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** 站点公告条：管理员发布后展示在所有登录/未登录用户的主界面顶部，可逐条关闭 */
export const AnnouncementBanner = () => {
  const t = useTranslate()
  const [items, setItems] = useState<Announcement[]>([])
  const [closed, setClosed] = useState<string[]>(readClosed)

  useEffect(() => {
    let alive = true
    void listActiveAnnouncements().then((list) => {
      if (alive) {
        setItems(list)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const visible = items.filter((item) => !closed.includes(item.id))
  if (visible.length === 0) {
    return null
  }

  const dismiss = (id: string) => {
    const next = [...closed, id]
    setClosed(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // 隐私模式下不可写时只影响本次页面
    }
  }

  return (
    <div className={styles.wrap}>
      {visible.slice(0, 3).map((item) => (
        <div key={item.id} className={`${styles.item} ${styles[item.level]}`} role="status">
          <div className={styles.text}>
            <div className={styles.title}>{item.title}</div>
            {item.body ? <div className={styles.body}>{item.body}</div> : null}
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label={t('close')}
            onClick={() => dismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
