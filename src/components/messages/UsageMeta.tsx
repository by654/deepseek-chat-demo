import { useTranslate } from '../../i18n/index.js'
import { DEFAULT_MODEL } from '../../services/chat/model.js'
import type { AssistantMessage } from '../../services/chat/types.js'
import { costBreakdown, formatCost } from '../../services/usage/pricing.js'
import { formatTokens, roundTokens } from '../../services/usage/tokens.js'
import { usePricing } from '../../services/usage/usePricing.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './UsageMeta.module.css'

/**
 * 单轮用量：本轮输入 / 输出 token、缓存命中 / 未命中 token，以及按当前模型与时段单价估算的费用。
 * 单价始终有值（官方单价预填），因此直接展示费用。
 */
export const UsageMeta = ({ message }: { message: AssistantMessage }) => {
  const t = useTranslate()
  const { price } = usePricing(message.model ?? DEFAULT_MODEL)
  const usage = message.usage
  if (!usage) {
    return null
  }

  const { input, output } = roundTokens(usage)
  const tokens = {
    cacheHit: usage.cache_read_input_tokens,
    cacheMiss: usage.input_tokens + usage.cache_creation_input_tokens,
    input,
    output,
    total: input + output,
  }
  const cost = costBreakdown(usage, price)

  return (
    <div className={styles.usage}>
      <span className={styles.tokens}>
        {t('usageTokens', { input: formatTokens(input), output: formatTokens(output) })}
        {' · '}
        {t('usageCacheHit', { value: formatTokens(tokens.cacheHit) })}
        {' · '}
        {t('usageCacheMiss', { value: formatTokens(tokens.cacheMiss) })}
      </span>
      <span className={styles.divider} aria-hidden />
      <Tooltip
        content={t('usageCostTitle', {
          hit: price.cacheHit,
          miss: price.cacheMiss,
          out: price.output,
        })}
      >
        <span className={styles.cost}>{t('usageCost', { cost: formatCost(cost.total) })}</span>
      </Tooltip>
    </div>
  )
}
