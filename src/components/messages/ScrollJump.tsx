import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { IconChevronDownOutline14 } from '../base/icons.js'
import { requestJumpToBottom, useAwayFromBottom } from './jumpState.js'
import styles from './ScrollJump.module.css'

/** 回到底部：远离底部时淡入，到底部后淡出，点击平滑滚动至最新消息 */
export const ScrollJump = () => {
  const t = useTranslate()
  const away = useAwayFromBottom()
  return (
    <button
      type="button"
      className={clsx(styles.jump, away && styles.visible)}
      aria-label={t('scrollToBottom')}
      aria-hidden={!away}
      tabIndex={away ? 0 : -1}
      title={t('scrollToBottom')}
      onClick={requestJumpToBottom}
    >
      <IconChevronDownOutline14 />
    </button>
  )
}
