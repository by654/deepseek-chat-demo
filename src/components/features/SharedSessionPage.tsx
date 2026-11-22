import { useEffect, useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { initAccount, useAccount } from '../../services/account.js'
import { importShare, loadShare, type LoadedShare } from '../../services/share.js'
import { formatSize } from '../../services/attachments.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import styles from './SharedSessionPage.module.css'

type ViewState =
  | { status: 'loading' }
  | { status: 'password'; share: LoadedShare | null }
  | { status: 'ready'; share: LoadedShare }
  | { status: 'error'; message: TranslationKey }

/** 去掉 share / session 参数后的应用地址 */
const appUrl = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete('share')
  url.searchParams.delete('session')
  return url.toString()
}

/** 只读分享页：不依赖主应用布局，匿名可访问（可选访问密码） */
export const SharedSessionPage = ({ id }: { id: string }) => {
  const t = useTranslate()
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [importing, setImporting] = useState(false)
  const user = useAccount((store) => store.user)

  useEffect(() => {
    void initAccount()
  }, [])

  useEffect(() => {
    let alive = true
    void loadShare(id).then((result) => {
      if (!alive) {
        return
      }
      if (result.ok) {
        setState({ status: 'ready', share: result.share })
        return
      }
      setState(
        result.reason === 'password'
          ? { status: 'password', share: null }
          : { status: 'error', message: result.reason === 'missing' ? 'shareNotFound' : 'shareFailed' }
      )
    })
    return () => {
      alive = false
    }
  }, [id])

  const submitPassword = async () => {
    setPasswordError(false)
    const result = await loadShare(id, password)
    if (result.ok) {
      setState({ status: 'ready', share: result.share })
      return
    }
    if (result.reason === 'password') {
      setPasswordError(true)
      return
    }
    setState({ status: 'error', message: 'shareNotFound' })
  }

  const importIntoChat = async (share: LoadedShare) => {
    if (!user || importing) {
      return
    }
    setImporting(true)
    try {
      const sessionId = await importShare(share)
      const url = new URL(appUrl())
      url.searchParams.set('session', sessionId)
      window.location.replace(url.toString())
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href={appUrl()}>
          <span className={styles.logo}>DS</span>
          <span>DeepSeek 美化版</span>
        </a>
        <span className={styles.badge}>{t('shareReadOnly')}</span>
        <a className={styles.back} href={appUrl()}>
          {t('shareBackToApp')}
        </a>
      </header>

      <main className={styles.main}>
        {state.status === 'loading' ? <div className={styles.hint}>{t('shareLoading')}</div> : null}

        {state.status === 'error' ? (
          <div className={styles.card}>
            <div className={styles.errorTitle}>{t(state.message)}</div>
            <a className={styles.cardAction} href={appUrl()}>
              {t('shareBackToApp')}
            </a>
          </div>
        ) : null}

        {state.status === 'password' ? (
          <div className={styles.card}>
            <div className={styles.cardTitle}>{t('sharePasswordPrompt')}</div>
            <input
              className={styles.passwordInput}
              type="password"
              autoFocus
              value={password}
              placeholder={t('sharePasswordPlaceholder')}
              onChange={(event) => {
                setPassword(event.target.value)
                setPasswordError(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void submitPassword()
                }
              }}
            />
            {passwordError ? <div className={styles.errorText}>{t('sharePasswordWrong')}</div> : null}
            <Button size="m" onClick={() => void submitPassword()}>
              {t('sharePasswordSubmit')}
            </Button>
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>{state.share.title}</h1>
              <div className={styles.meta}>
                {state.share.createdAt ? new Date(state.share.createdAt).toLocaleString('zh-CN') : ''}
                {state.share.payload.messages.length
                  ? ` · ${t('shareMessageCount', { count: state.share.payload.messages.length })}`
                  : ''}
              </div>
            </div>

            <div className={styles.messages}>
              {state.share.payload.messages.map((message, index) =>
                message.role === 'user' ? (
                  <div key={`u-${index}`} className={styles.userRow}>
                    <div className={styles.userBubble}>
                      {message.text ? <div className={styles.userText}>{message.text}</div> : null}
                      {message.files.length > 0 ? (
                        <div className={styles.files}>
                          {message.files.map((file, fileIndex) => (
                            <span key={`${file.name}-${fileIndex}`} className={styles.file}>
                              {file.name}
                              <span className={styles.fileMeta}>{formatSize(file.size)}</span>
                              {file.note ? <span className={styles.fileNote}>{file.note}</span> : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div key={`a-${index}`} className={styles.assistantRow}>
                    <Markdown
                      content={message.text}
                      loading={false}
                      cacheKey={`share-${id}-${index}`}
                      disableLink={false}
                    />
                  </div>
                )
              )}
            </div>

            <div className={styles.footer}>
              {user ? (
                <Button size="m" disabled={importing} onClick={() => void importIntoChat(state.share)}>
                  {importing ? t('shareImporting') : t('shareImport')}
                </Button>
              ) : (
                <div className={styles.hint}>{t('shareImportLogin')}</div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
