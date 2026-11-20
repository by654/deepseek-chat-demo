import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getDraft, setDraftText } from '../../services/chat/drafts.js'
import { useChatStore } from '../../services/chat/store.js'
import { showToast } from '../base/toastState.js'
import styles from './SelectionQuote.module.css'

type Tip = { left: number; top: number; text: string }

const QUOTE_LIMIT = 2000

/**
 * 框选引用：在回答正文中选中文字后浮出「引用」按钮，点击把选中内容以引用块写入输入框。
 */
export const SelectionQuote = () => {
  const t = useTranslate()
  const activeId = useChatStore((state) => state.activeId)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const clear = () => setTip(null)
    const measure = () => {
      const selection = window.getSelection()
      const text = selection?.toString().trim() ?? ''
      if (!selection || selection.isCollapsed || !text || text.length > QUOTE_LIMIT) {
        clear()
        return
      }
      const anchor = selection.anchorNode
      const element = anchor instanceof Element ? anchor : anchor?.parentElement
      if (!element?.closest('[data-quotable]')) {
        clear()
        return
      }
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        clear()
        return
      }
      const top = rect.top > 48 ? rect.top - 36 : rect.bottom + 8
      setTip({ left: rect.left + rect.width / 2, top, text })
    }

    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest(`.${styles.quote}`)) {
        return
      }
      clear()
    }
    const onScroll = () => clear()

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('mouseup', measure)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('mouseup', measure)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  if (!tip) {
    return null
  }

  const quote = () => {
    if (!activeId) {
      return
    }
    const block = tip.text
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n')
    const current = getDraft(activeId).text.trimEnd()
    setDraftText(activeId, current ? `${current}\n\n${block}\n\n` : `${block}\n\n`)
    showToast(t('quoteAdded'))
    setTip(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <button
      type="button"
      className={styles.quote}
      style={{ left: tip.left, top: tip.top }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={quote}
    >
      {t('quoteAdd')}
    </button>
  )
}
