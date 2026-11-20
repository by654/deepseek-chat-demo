import { useState } from 'react'
import { IconCloseOutline16 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import type { QueuedMessage } from '../../services/chat/queue.js'
import styles from './QueueList.module.css'

type Props = {
  items: QueuedMessage[]
  onEdit: (id: string, text: string) => void
  onRemove: (id: string) => void
}

/** 输入框上方的待发队列：显示顺序、允许就地编辑与删除 */
export const QueueList = ({ items, onEdit, onRemove }: Props) => {
  const t = useTranslate()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (items.length === 0) {
    return null
  }

  const commit = () => {
    if (editingId === null) {
      return
    }
    const text = draft.trim()
    if (text.length > 0) {
      onEdit(editingId, text)
    }
    setEditingId(null)
    setDraft('')
  }

  return (
    <div className={styles.root} aria-label={t('queueTitle')}>
      <div className={styles.header}>
        <span className={styles.title}>{t('queueTitle')}</span>
        <span className={styles.count}>{items.length}</span>
        <span className={styles.hint}>{t('queueHint')}</span>
      </div>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.index}>{index + 1}</span>
            {editingId === item.id ? (
              <input
                className={styles.editor}
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    commit()
                  }
                  if (event.key === 'Escape') {
                    setEditingId(null)
                    setDraft('')
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.text}
                title={item.text}
                onClick={() => {
                  setEditingId(item.id)
                  setDraft(item.text)
                }}
              >
                {item.text}
              </button>
            )}
            <button
              type="button"
              className={styles.remove}
              aria-label={t('queueRemove')}
              onClick={() => onRemove(item.id)}
            >
              <IconCloseOutline16 />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
