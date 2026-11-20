import { useTranslate } from '../../i18n/index.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { useSettings } from '../../services/settings.js'
import type { AssistantMessage, Session } from '../../services/chat/types.js'
import {
  formatTokens,
  latestContextTokens,
  sessionTokens,
} from '../../services/usage/tokens.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './SessionUsage.module.css'

/**
 * 输入区上方的会话用量条：整个会话累计 token 与上下文剩余额度。
 * 数据全部来自真实响应中的 usage 字段，无用量时不展示。
 */
export const SessionUsage = ({ session }: { session: Session }) => {
  const t = useTranslate()
  const window = useSettings((state) => state.contextWindow)
  const messages = getVisibleMessages(session)
  const totals = sessionTokens(messages)
  const latest = latestContextTokens(
    messages.filter((message): message is AssistantMessage => message.role === 'assistant')
  )
  if (totals.total === 0 && latest === null) {
    return null
  }

  const left = latest === null ? null : Math.max(0, window - latest)
  const usedRatio = latest === null ? 0 : Math.min(1, latest / window)
  const tooltip = t('statusTooltip', {
    input: formatTokens(totals.input),
    output: formatTokens(totals.output),
    window: formatTokens(window),
    left: left === null ? '—' : formatTokens(left),
  })

  return (
    <Tooltip content={tooltip}>
      <div className={styles.status} role="status" aria-label={t('statusLabel')}>
        <span className={styles.item}>
          {t('statusSessionTokens', { total: formatTokens(totals.total) })}
        </span>
        <span className={styles.divider} aria-hidden />
        <span className={styles.item}>
          {left === null
            ? t('statusContextEmpty')
            : t('statusContextLeft', { left: formatTokens(left) })}
        </span>
        <span className={styles.meter} aria-hidden>
          <span
            className={styles.meterFill}
            style={{ transform: `scaleX(${usedRatio.toFixed(3)})` }}
          />
        </span>
      </div>
    </Tooltip>
  )
}
