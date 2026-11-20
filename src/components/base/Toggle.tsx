import clsx from 'clsx'
import styles from './Toggle.module.css'

/** 开关：设置项里的布尔选择，44px 触摸目标 */
export const Toggle = ({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className={clsx(styles.toggle, checked && styles.on)}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.knob} />
  </button>
)
