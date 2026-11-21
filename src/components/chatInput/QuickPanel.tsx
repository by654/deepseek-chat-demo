import clsx from 'clsx'
import { useEffect, useState } from 'react'
import {
  IconCheckedOutline14,
  IconChevronDownOutline14,
  IconRefreshOutline16,
} from '../base/icons.js'
import { setSessionModel, useSessionModel } from '../../services/chat/model.js'
import { refreshBalanceNow, useBalance } from '../../services/account/balance.js'
import { useSettings } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'
import { MODELS } from './ModelPicker.js'
import styles from './QuickPanel.module.css'

const SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$' }

const formatMoney = (total: string, currency: string | null) => {
  const symbol = currency ? SYMBOLS[currency] : undefined
  return symbol ? `${symbol}${total}` : `${total} ${currency ?? ''}`.trim()
}

/**
 * 窄屏工具面板：把余额与模型选择收进发送键左侧的箭头面板，
 * 避免小屏功能栏被挤爆，同时让手机上也能看到余额金额。
 */
export const QuickPanel = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const model = useSessionModel(sessionId)
  const apiKey = useSettings((state) => state.apiKey)
  const status = useBalance((state) => state.status)
  const total = useBalance((state) => state.total)
  const currency = useBalance((state) => state.currency)
  const reason = useBalance((state) => state.reason)
  const pending = useBalance((state) => state.pending)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const loading = pending || status === 'loading'
  const amount = status === 'ok' && total !== null ? formatMoney(total, currency) : null
  const balanceText = !apiKey
    ? t('balanceNoKey')
    : loading
      ? t('balanceRefreshing')
      : (amount ?? (status === 'unavailable' ? t('balanceUnavailable') : '—'))
  const balanceHint =
    status === 'ok'
      ? null
      : status === 'unavailable'
        ? t('balanceUnavailableDetail')
        : reason
          ? t('balanceErrorDetail', { reason })
          : null

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={clsx(styles.trigger, open && styles.open)}
        aria-label={t('modelPanelTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.chevron}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open ? (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.panel} role="dialog" aria-label={t('modelPanelTitle')}>
            <div className={styles.groupTitle}>{t('modelPanelBalance')}</div>
            <div className={styles.balanceRow}>
              <span className={clsx(styles.amount, loading && styles.pending)}>
                {balanceText}
              </span>
              <button
                type="button"
                className={styles.refresh}
                aria-label={t('balanceRefreshNow')}
                aria-busy={loading}
                disabled={!apiKey || loading}
                onClick={() => {
                  if (apiKey) {
                    void refreshBalanceNow(apiKey)
                  }
                }}
              >
                <span className={clsx(styles.refreshIcon, loading && styles.spin)}>
                  <IconRefreshOutline16 />
                </span>
              </button>
            </div>
            {balanceHint ? <div className={styles.hint}>{balanceHint}</div> : null}
            <div className={styles.divider} />
            <div className={styles.groupTitle}>{t('modelPanelModel')}</div>
            <div className={styles.modelList} role="listbox" aria-label={t('modelLabel')}>
              {MODELS.map((item) => {
                const active = item.value === model
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={clsx(styles.model, active && styles.modelActive)}
                    onClick={() => {
                      setSessionModel(sessionId, item.value)
                      setOpen(false)
                    }}
                  >
                    <span className={styles.modelName}>{t(item.label)}</span>
                    <span className={styles.modelCheck}>
                      {active ? <IconCheckedOutline14 /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
