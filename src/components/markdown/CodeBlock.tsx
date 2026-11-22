import { useTranslate } from '../../i18n/index.js'
import { memo, useEffect, useMemo, useReducer, useState } from 'react'
import Prism from 'prismjs'
import {
  getHighlightLang,
  isHighlightLoaded,
  loadHighlight,
} from '../../services/markdown/highlight.js'
import { IconCheckOutline16, IconCopyOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { copyText } from '../../utils/clipboard.js'
import { MermaidDiagram } from './MermaidDiagram.js'
import { Modal } from '../base/Modal.js'
import { markdownToHtml } from '../../services/export/sessionExport.js'
import { IconPlayOutline16 } from '../features/icons.js'
import features from '../features/features.module.css'
import styles from './CodeBlock.module.css'

const RUNNABLE = new Set(['html', 'svg', 'js', 'javascript', 'md', 'markdown'])

const sandboxDocument = (code: string, infostring: string) => {
  const lang = infostring.toLowerCase()
  const style =
    '<style>body{font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;margin:0;padding:16px;color:#111;background:#fff}pre{white-space:pre-wrap;word-break:break-word}</style>'
  if (lang === 'html' || lang === 'svg') {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}</head><body>${code}</body></html>`
  }
  if (lang === 'md' || lang === 'markdown') {
    return `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${markdownToHtml(code)}</body></html>`
  }
  return `<!doctype html><html><head><meta charset="utf-8">${style}</head><body><pre id="out"></pre><script>
    const out = document.getElementById('out');
    const log = (...args) => { out.textContent += args.map(v => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v) } catch { return String(v) } })()).join(' ') + '\\n' };
    console.log = log; console.error = (...a) => log('[error]', ...a);
    try { ${code}\n } catch (error) { out.textContent += '\\n' + error.stack; }
  </scr${''}ipt></body></html>`
}

/** 代码块标题栏：左侧语言名，右侧运行与复制 */
const CodeInfoRow = ({
  code,
  infostring,
  showDiagram,
  onToggleDiagram,
  onRun,
}: {
  code: string
  infostring: string
  showDiagram: boolean
  onToggleDiagram?: () => void
  onRun?: () => void
}) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.container}>
      {onToggleDiagram ? (
        <div className="md-code-block-switch" aria-label={t('mermaidSwitchLabel')}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={showDiagram}
            onClick={() => !showDiagram && onToggleDiagram()}
          >
            {t('mermaidDiagram')}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={!showDiagram}
            onClick={() => showDiagram && onToggleDiagram()}
          >
            {t('mermaidCode')}
          </button>
        </div>
      ) : (
        <span className={styles.name}>{infostring}</span>
      )}
      <div className={styles.actions}>
        {onRun ? (
          <button type="button" className={styles.button} onClick={onRun}>
            <IconPlayOutline16 />
            <span>运行</span>
          </button>
        ) : null}
        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            if (!(await copyText(code))) {
              showToast({ key: 'copyFailed' })
              return
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          <span>{t(copied ? 'copied' : 'copy')}</span>
        </button>
      </div>
    </div>
  )
}

/** 代码块：语言包按需加载，不支持或尚未加载的语言按纯文本显示 */
export const CodeBlock = memo(function CodeBlock({
  code,
  infostring,
  loading = false,
}: {
  code: string
  infostring: string
  loading?: boolean
}) {
  const isMermaid = infostring.toLowerCase() === 'mermaid'
  const [showDiagram, setShowDiagram] = useState(true)
  const [sandboxOpen, setSandboxOpen] = useState(false)
  const runnable = RUNNABLE.has(infostring.toLowerCase())
  // 语言包注册在全局 Prism 上，每次渲染直接判断；加载完成后触发一次重渲染
  const rerender = useReducer((n: number) => n + 1, 0)[1]
  const lang = getHighlightLang(infostring)
  const loaded = lang !== null && isHighlightLoaded(lang)
  useEffect(() => {
    if (lang === null || loaded) {
      return
    }
    let unmounted = false
    loadHighlight(lang).then(() => {
      if (!unmounted) {
        rerender()
      }
    })
    return () => {
      unmounted = true
    }
  }, [lang, loaded, rerender])
  const renderedHtml = useMemo(() => {
    const name = lang !== null && loaded ? lang : 'plaintext'
    return Prism.highlight(code, Prism.languages[name], name)
  }, [code, lang, loaded])
  return (
    <>
      <div className="md-code-block">
        <div className="md-code-block-banner">
          <CodeInfoRow
            code={code}
            infostring={infostring}
            showDiagram={showDiagram}
            onToggleDiagram={isMermaid ? () => setShowDiagram((show) => !show) : undefined}
            onRun={runnable ? () => setSandboxOpen(true) : undefined}
          />
        </div>
        {isMermaid && showDiagram ? (
          <MermaidDiagram code={code} loading={loading} />
        ) : (
          <pre dangerouslySetInnerHTML={{ __html: renderedHtml }}></pre>
        )}
      </div>
      {sandboxOpen ? (
        <Modal
          title={`代码沙箱 · ${infostring}`}
          closable
          className={features.sandbox}
          onClose={() => setSandboxOpen(false)}
          footer={
            <button
              type="button"
              className={features.chip}
              onClick={() => setSandboxOpen(false)}
            >
              关闭
            </button>
          }
        >
          <iframe
            className={features.sandboxFrame}
            title="代码沙箱"
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={sandboxDocument(code, infostring)}
          />
        </Modal>
      ) : null}
    </>
  )
})
