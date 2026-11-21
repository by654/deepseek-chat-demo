import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { useSessionModel } from '../../services/chat/model.js'
import { useSettings } from '../../services/settings.js'
import type { AssistantMessage, Session } from '../../services/chat/types.js'
import {
  API_CALL_KINDS,
  API_CALL_LABELS,
  apiCallCount,
  apiUsageTotals,
  useApiUsage,
  type ApiCallKind,
} from '../../services/usage/apiUsage.js'
import { costFromTokens, formatCost } from '../../services/usage/pricing.js'
import { usePricing } from '../../services/usage/usePricing.js'
import { formatTokens, latestContextTokens, sessionTokens } from '../../services/usage/tokens.js'
import { IconChevronDownOutline14 } from '../base/icons.js'
import { openSettings } from '../settings/settingsDialogState.js'
import styles from './SessionUsage.module.css'

/** 明细里展示的「其他接口」顺序；chat 单独放在本会话分组 */
const OTHER_KINDS: readonly ApiCallKind[] = API_CALL_KINDS.filter((kind) => kind !== 'chat')

/** 每个接口的补充单位：语音类显示字数/秒数，其余只显示次数 */
const kindExtra = (
  kind: ApiCallKind,
  ttsChars: number,
  asrSeconds: number
): { key: 'statusChars' | 'statusSeconds'; value: number } | null => {
  if (kind === 'tts' && ttsChars > 0) {
    return { key: 'statusChars', value: ttsChars }
  }
  if (kind === 'asr' && asrSeconds > 0) {
    return { key: 'statusSeconds', value: asrSeconds }
  }
  return null
}

/**
 * 输入区上方的会话用量：默认只保留一行摘要（总 token、费用、上下文水位、闲峰标签），
 * 点击后展开明细，把本会话与「其他接口」分开展示，避免竖屏下把一长串数字全铺在输入框上方。
 */
export const SessionUsage = ({ session }: { session: Session }) => {
  const t = useTranslate()
  const window = useSettings((state) => state.contextWindow)
  const model = useSessionModel(session.id)
  const { tier, price } = usePricing(model)
  const messages = getVisibleMessages(session)
  const totals = sessionTokens(messages)
  const latest = latestContextTokens(
    messages.filter((message): message is AssistantMessage => message.role === 'assistant')
  )
  const apiUsage = useApiUsage()
  const other = apiUsageTotals(apiUsage)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  if (totals.total === 0 && latest === null && other.total === 0) {
    return null
  }

  const cost = costFromTokens(totals, price)
  const left = latest === null ? null : Math.max(0, window - latest)
  const usedRatio = latest === null ? 0 : Math.min(1, latest / window)
  const tierLabel = tier === 'peak' ? t('statusTierPeak') : t('statusTierOffpeak')
  const chatRequests = messages.filter((message) => message.role === 'assistant').length
  // 只展示实际发生过的其他接口，避免竖屏明细里铺满一列「0 次」
  const activeOthers = OTHER_KINDS.filter((kind) => apiCallCount(apiUsage, kind) > 0)

  const summary = totals.total > 0
    ? t('statusSessionTokens', { total: formatTokens(totals.total) })
    : t('statusOtherRequests', { count: other.total })

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={clsx(styles.bar, open && styles.barOpen)}
        aria-expanded={open}
        aria-label={t('statusSummaryLabel')}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.summary}>{summary}</span>
        {totals.total > 0 ? <span className={styles.cost}>{formatCost(cost.total)}</span> : null}
        <span className={styles.meter} aria-hidden>
          <span
            className={styles.meterFill}
            style={{ transform: `scaleX(${usedRatio.toFixed(3)})` }}
          />
        </span>
        <span className={styles.tier}>{tierLabel}</span>
        <span className={clsx(styles.chevron, open && styles.chevronOpen)} aria-hidden>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open ? (
        <div className={styles.panel} role="region" aria-label={t('statusDetails')}>
          <div className={styles.group}>
            <div className={styles.groupTitle}>{t('statusSessionGroup')}</div>
            <Row label={t('statusTotalTokens')} value={formatTokens(totals.total)} />
            <Row label={t('statusInputTokens')} value={formatTokens(totals.input)} />
            <Row label={t('statusOutputTokens')} value={formatTokens(totals.output)} />
            <Row label={t('statusCacheHitTokens')} value={formatTokens(totals.cacheHit)} />
            <Row label={t('statusCacheMissTokens')} value={formatTokens(totals.cacheMiss)} />
            <Row label={t('statusInputCost')} value={formatCost(cost.cacheHit + cost.cacheMiss)} />
            <Row label={t('statusOutputCost')} value={formatCost(cost.output)} />
            <Row label={t('statusTotalCost')} value={formatCost(cost.total)} strong />
            <Row
              label={t('statusContext')}
              value={
                left === null ? t('statusContextEmpty') : formatTokens(left)
              }
            />
            <Row label={t('statusChatRequests')} value={t('statusCalls', { count: chatRequests })} />
          </div>
          <div className={styles.group}>
            <div className={styles.groupTitle}>{t('statusOtherGroup')}</div>
            {activeOthers.length === 0 ? (
              <div className={styles.empty}>{t('statusNoOtherCalls')}</div>
            ) : (
              <>
                {activeOthers.map((kind) => {
                  const extra = kindExtra(kind, apiUsage.ttsChars, apiUsage.asrSeconds)
                  const count = apiCallCount(apiUsage, kind)
                  const failures = apiUsage.calls[kind].failure
                  return (
                    <Row
                      key={kind}
                      label={t(API_CALL_LABELS[kind])}
                      value={
                        <span className={styles.multiValue}>
                          {t('statusCalls', { count })}
                          {extra ? ` · ${t(extra.key, { count: extra.value })}` : ''}
                          {failures > 0 ? (
                            <span className={styles.failure}>
                              {' '}
                              {t('statusFailures', { count: failures })}
                            </span>
                          ) : null}
                        </span>
                      }
                    />
                  )
                })}
                <Row
                  label={t('statusOtherRequests')}
                  value={t('statusCalls', { count: other.total })}
                />
                <Row label={t('statusOtherCost')} value={t('statusOtherCostValue')} strong />
                <div className={styles.hint}>{t('statusOtherCostHint')}</div>
              </>
            )}
          </div>
          <button
            type="button"
            className={styles.settingsLink}
            onClick={() => {
              setOpen(false)
              openSettings('usage')
            }}
          >
            {t('statusOpenSettings')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

const Row = ({
  label,
  value,
  strong = false,
}: {
  label: string
  value: ReactNode
  strong?: boolean
}) => (
  <div className={clsx(styles.row, strong && styles.rowStrong)}>
    <span className={styles.rowLabel}>{label}</span>
    <span className={styles.rowValue}>{value}</span>
  </div>
)
