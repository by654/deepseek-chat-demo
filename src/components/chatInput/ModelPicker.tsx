import clsx from 'clsx'
import { IconCheckedOutline14, IconChevronDownOutline14 } from '../base/icons.js'
import { Menu, type MenuOption } from '../base/Menu.js'
import { Tooltip } from '../base/Tooltip.js'
import { setSessionModel, useSessionModel } from '../../services/chat/model.js'
import type { ChatModel } from '../../services/api/types.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import styles from './ModelPicker.module.css'

type ModelMeta = {
  value: ChatModel
  /** 完整名称，用于菜单与无障碍标签 */
  label: TranslationKey
  /** 窄屏下的短标签，避免挤压工具条 */
  short: string
}

const MODELS: ModelMeta[] = [
  { value: 'deepseek-flash', label: 'modelFlash', short: 'Flash' },
  { value: 'deepseek-v4-pro', label: 'modelPro', short: 'V4 Pro' },
]

/** 模型选择：选择结果按会话保存（见 services/chat/model.ts），下一条回答即按新模型请求 */
export const ModelPicker = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const model = useSessionModel(sessionId)
  const current = MODELS.find((item) => item.value === model) ?? MODELS[0]
  const options: MenuOption[] = MODELS.map((item) => ({
    key: item.value,
    label: t(item.label),
    icon:
      item.value === model ? (
        <IconCheckedOutline14 />
      ) : (
        <span className={styles.placeholder} aria-hidden />
      ),
    onSelect: () => setSessionModel(sessionId, item.value),
  }))

  return (
    <Menu options={options}>
      {({ open, toggle }) => (
        <Tooltip content={t('modelTooltip')}>
          <button
            type="button"
            className={clsx(styles.picker, open && styles.open)}
            aria-label={`${t('modelLabel')}：${t(current.label)}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
          >
            <span className={styles.name}>{t(current.label)}</span>
            <span className={styles.short}>{current.short}</span>
            <span className={styles.chevron}>
              <IconChevronDownOutline14 />
            </span>
          </button>
        </Tooltip>
      )}
    </Menu>
  )
}
