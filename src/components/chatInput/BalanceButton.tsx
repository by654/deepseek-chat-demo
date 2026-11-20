import clsx from 'clsx'
import { useEffect } from 'react'
import {
  configureBalanceAutoRefresh,
  refreshBalanceNow,
  useBalance,
} from '../../services/account/balance.js'
import { useSettings } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'
import { IconRefreshOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './BalanceButton.module.css'

const SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$' }

const formatMoney = (total: string, currency: string | null) => {
  const symbol = currency ? SYMBOLS[currency] : undefined
  return symbol ? `${symbol}${total}` : `${total} ${currency ?? ''}`.trim()
}

const formatTime = (time: number | null) =>
  time === null
    ? ''
    : new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * 账户余额：点击手动刷新，并按设置间隔自动刷新。
 * 接口不可用或请求失败时如实展示状态与原因，不展示任何推算数值。
 */
export const BalanceButton = () => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const interval = useSettings((state) => state.balanceRefreshMinutes)
  const status = useBalance((state) => state.status)
  const total = useBalance((state) => state.total)
  const currency = useBalance((state) => state.currency)
  const granted = useBalance((state) => state.granted)
  const toppedUp = useBalance((state) => state.toppedUp)
  const available = useBalance((state) => state.available)
  const reason = useBalance((state) => state.reason)
  const updatedAt = useBalance((state) => state.updatedAt)
  const pending = useBalance((state) => state.pending)

  // 密钥就绪后拉取一次；换密钥时重新拉取
  useEffect(() => {
    if (apiKey) {
      void refreshBalanceNow(apiKey)
    }
  }, [apiKey])

  // 自动刷新间隔变化时重建定时器
  useEffect(() => {
    configureBalanceAutoRefresh(interval, () => useSettings.getState().apiKey)
  }, [interval])

  const loading = pending || status === 'loading'
  const symbol = status === 'ok' && total !== null ? formatMoney(total, currency) : null

  const label = !apiKey
    ? t('balanceNoKey')
    : loading
      ? t('balanceRefreshing')
      : symbol !== null
        ? symbol
        : status === 'unavailable'
          ? t('balanceUnavailable')
          : `${t('balanceLabel')} —`

  const tooltip = !apiKey
    ? t('balanceNoKey')
    : loading
      ? t('balanceRefreshing')
      : status === 'ok' && total !== null
        ? [
            t('balanceTooltipOk', {
              total,
              currency: currency ?? '',
              granted: granted ?? '—',
              toppedUp: toppedUp ?? '—',
            }),
            available ? '' : t('insufficientBalance'),
            updatedAt === null ? '' : t('balanceUpdated', { time: formatTime(updatedAt) }),
          ]
            .filter(Boolean)
            .join('　')
        : status === 'unavailable'
          ? t('balanceUnavailableDetail')
          : t('balanceErrorDetail', { reason: reason ?? '' })

  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        className={clsx(
          styles.balance,
          loading && styles.loading,
          status === 'ok' && styles.ok,
          !apiKey && styles.dim
        )}
        aria-label={`${t('balanceLabel')}：${label}`}
        aria-busy={loading}
        disabled={!apiKey}
        onClick={() => {
          if (apiKey) {
            void refreshBalanceNow(apiKey)
          }
        }}
      >
        <span className={clsx(styles.icon, loading && styles.spin)}>
          <IconRefreshOutline16 />
        </span>
        <span className={styles.label}>{label}</span>
      </button>
    </Tooltip>
  )
}
