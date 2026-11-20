import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { estimateCost, formatCost } from '../../services/usage/pricing.js'
import { formatTokens, roundTokens } from '../../services/usage/tokens.js'
import type { AssistantMessage } from '../../services/chat/types.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './UsageMeta.module.css'

/**
 * 单轮用量：本轮输入 / 输出 token 与按设置单价估算的费用。
 * 单价未配置时展示「费用待配置」，不使用任何猜测价格。
 */
export const UsageMeta = ({ message }: { message: AssistantMessage }) => {
  const t = useTranslate()
  const pricingInput = useSettings((state) => state.pricingInput)
  const pricingOutput = useSettings((state) => state.pricingOutput)
  const usage = message.usage
  if (!usage) {
    return null
  }

  const { input, output } = roundTokens(usage)
  const cost = estimateCost(usage, { input: pricingInput, output: pricingOutput })

  return (
    <div className={styles.usage}>
      <span className={styles.tokens}>
        {t('usageTokens', { input: formatTokens(input), output: formatTokens(output) })}
      </span>
      <span className={styles.divider} aria-hidden />
      {cost === null ? (
        <Tooltip content={t('usageCostHint')}>
          <span className={styles.unset}>{t('usageCostUnset')}</span>
        </Tooltip>
      ) : (
        <Tooltip
          content={t('usageCostTitle', {
            input: pricingInput ?? '',
            output: pricingOutput ?? '',
          })}
        >
          <span className={styles.cost}>{t('usageCost', { cost: formatCost(cost) })}</span>
        </Tooltip>
      )}
    </div>
  )
}
