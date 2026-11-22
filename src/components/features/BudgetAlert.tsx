import { useEffect, useState } from 'react'
import { useChatStore } from '../../services/chat/store.js'
import { loadUsageReport } from '../../services/usageReport.js'
import { useSettings } from '../../services/settings.js'
import { formatCost } from '../../services/usage/pricing.js'
import styles from './features.module.css'

/** 月度预算告警：当月累计费用超过阈值时在顶部提示，可在本月内关闭。 */
export const BudgetAlert = () => {
  const budget = useSettings((state) => state.monthlyBudget)
  const sessions = useChatStore((state) => state.sessions)
  const ready = useChatStore((state) => state.ready)
  const [cost, setCost] = useState(0)
  const [dismissed, setDismissed] = useState(() => {
    const month = new Date().toISOString().slice(0, 7)
    try {
      return localStorage.getItem('chat-demo:budget-dismissed') === month
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!ready || budget <= 0) {
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      void loadUsageReport().then((report) => {
        if (alive) {
          setCost(report.currentMonthCost)
        }
      })
    }, 800)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [ready, budget, sessions])

  if (budget <= 0 || dismissed || cost <= budget) {
    return null
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 10,
        padding: '8px 16px',
        borderBottom: '1px solid var(--ui-border-subtle)',
        background: 'var(--ui-danger-soft, rgba(220, 38, 38, 0.08))',
        color: 'var(--ui-danger)',
        fontSize: 12.5,
      }}
    >
      <span>
        本月已花费 {formatCost(cost)}，超过预算 {formatCost(budget)}。
      </span>
      <button
        type="button"
        className={styles.bannerAction}
        onClick={() => {
          const month = new Date().toISOString().slice(0, 7)
          try {
            localStorage.setItem('chat-demo:budget-dismissed', month)
          } catch {
            // 忽略
          }
          setDismissed(true)
        }}
      >
        本月不再提醒
      </button>
    </div>
  )
}
