import { useEffect, useRef, useState } from 'react'
import { Modal } from '../base/Modal.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { COMPARE_MODELS, runCompare, type CompareSide } from '../../services/compare.js'
import { setDraftText, getDraft } from '../../services/chat/drafts.js'
import { useChatStore } from '../../services/chat/store.js'
import { showToast } from '../base/toastState.js'
import { closeCompareDialog, useCompareDialog } from './commandPaletteState.js'
import styles from './features.module.css'

const initialSides = (): CompareSide[] =>
  COMPARE_MODELS.map((model) => ({ model, text: '', status: 'idle', startedAt: 0 }))

export const CompareDialog = () => {
  const open = useCompareDialog((state) => state.open)
  return open ? <CompareContent /> : null
}

const CompareContent = () => {
  const [prompt, setPrompt] = useState(() => useCompareDialog.getState().prompt)
  const [sides, setSides] = useState<CompareSide[]>(initialSides)
  const controllerRef = useRef<AbortController | null>(null)
  const running = sides.some((side) => side.status === 'running')
  const hasText = sides.some((side) => side.text.trim())

  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  const update = (next: CompareSide) =>
    setSides((current) =>
      current.map((side) => (side.model === next.model ? next : side))
    )

  const start = () => {
    if (!prompt.trim() || running) {
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setSides(initialSides().map((side) => ({ ...side, status: 'running', startedAt: Date.now() })))
    void runCompare(prompt.trim(), controller.signal, update)
  }

  const stop = () => {
    controllerRef.current?.abort()
    setSides((current) =>
      current.map((side) =>
        side.status === 'running' ? { ...side, status: 'stopped', endedAt: Date.now() } : side
      )
    )
  }

  const insert = (text: string) => {
    const activeId = useChatStore.getState().activeId
    const current = getDraft(activeId).text
    setDraftText(activeId, current ? `${current}\n\n${text}` : text)
    showToast({ key: 'compareInserted' })
    closeCompareDialog()
  }

  return (
    <Modal
      title="双模型并排对比"
      closable
      className={styles.compareModal}
      onClose={() => {
        controllerRef.current?.abort()
        closeCompareDialog()
      }}
      footer={
        <>
          <Button size="m" variant="outlined" onClick={stop} disabled={!running}>
            停止
          </Button>
          <Button size="m" onClick={start} disabled={running || !prompt.trim()}>
            {running ? '对比中…' : '开始对比'}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>同一个问题，分别用 Flash 与 Pro 回答</span>
          <textarea
            className={styles.textarea}
            value={prompt}
            placeholder="输入问题，或从输入框带过来…"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                start()
              }
            }}
          />
        </label>
        <div className={styles.compareGrid}>
          {sides.map((side) => (
            <div key={side.model} className={styles.compareCol}>
              <div className={styles.compareHead}>
                <span>{side.model}</span>
                <span className={styles.compareMeta}>
                  {side.status === 'running'
                    ? '生成中…'
                    : side.status === 'done'
                      ? `${(((side.endedAt ?? 0) - side.startedAt) / 1000).toFixed(1)}s`
                      : side.status === 'error'
                        ? '失败'
                        : side.status === 'stopped'
                          ? '已停止'
                          : '等待'}
                </span>
              </div>
              <div className={styles.compareBody}>
                {side.text ? (
                  <Markdown
                    content={side.text}
                    loading={side.status === 'running'}
                    cacheKey={`compare-${side.model}`}
                    disableLink={false}
                  />
                ) : side.error ? (
                  <span className={styles.compareError}>{side.error}</span>
                ) : (
                  <span className={styles.empty}>
                    {side.status === 'running' ? '正在思考…' : '尚无内容'}
                  </span>
                )}
              </div>
              <div className={styles.formActions} style={{ padding: '8px 10px' }}>
                <Button
                  size="s"
                  variant="outlined"
                  disabled={!side.text.trim()}
                  onClick={() => insert(side.text)}
                >
                  插入输入框
                </Button>
              </div>
            </div>
          ))}
        </div>
        {hasText ? (
          <div className={styles.paletteFoot}>
            <span>对比结果不会写入会话，可分别插入后继续追问。</span>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
