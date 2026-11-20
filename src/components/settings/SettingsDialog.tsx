import clsx from 'clsx'
import { useRef, useState, type ReactNode } from 'react'
import {
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconEditOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconSendOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import { Toggle } from '../base/Toggle.js'
import { accentPresets, CUSTOM_PRESET_ID, presetBrand } from '../../app/presets.js'
import { downloadWord } from '../../services/export/wordExport.js'
import { downloadLog } from '../../services/logs.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
} from '../../services/chat/backup.js'
import type { ConflictResolution, ImportMode } from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  applyFontScale,
  isChineseBrowser,
  setContextWindow,
  setCustomBrand,
  setFadeOutput,
  setFirstTurnPrompt,
  setFontCode,
  setFontText,
  setFontThinking,
  setLocale,
  setLocation,
  setPricingInput,
  setPricingOutput,
  setQueueEnabled,
  setQueueMode,
  setRestoreMode,
  setSystemPrompt,
  setThemePreference,
  setThemePreset,
  setTtsVoice,
  setWordColor,
  setWordExportEnabled,
  setWordFontFamily,
  setWordFontSize,
  useSettings,
  type QueueMode,
  type RestoreMode,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import {
  MAX_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
  parseContextWindow,
  parsePrice,
} from '../../services/usage/pricing.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'appearance', label: 'settingsTabAppearance', icon: <IconLightOutline16 /> },
  { value: 'queue', label: 'settingsTabQueue', icon: <IconSendOutline16 /> },
  { value: 'prompt', label: 'settingsTabPrompt', icon: <IconEditOutline16 /> },
  { value: 'word', label: 'settingsTabWord', icon: <IconDownloadOutline16 /> },
  { value: 'logs', label: 'settingsTabLogs', icon: <IconDataOutline16 /> },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          if (!historyDelete.busy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => setSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content}>
          {section === 'general' ? (
            <>
              <RestoreSetting />
              <UsageSetting />
              <LocaleSetting />
              <TtsVoiceSetting />
              <LocationSetting />
            </>
          ) : section === 'appearance' ? (
            <>
              <ThemeSetting />
              <AccentSetting />
              <FontSetting />
              <FadeSetting />
            </>
          ) : section === 'queue' ? (
            <QueueSetting />
          ) : section === 'prompt' ? (
            <PromptSetting />
          ) : section === 'word' ? (
            <WordSetting />
          ) : section === 'logs' ? (
            <LogsSetting />
          ) : (
            <>
              <ApiKeyField editor={apiKeyEditor} />
              <ImportHistory historyImport={historyImport} disabled={historyBusy} />
              <ExportHistory disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          )}
        </div>
      </Modal>
      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 覆盖导入的二次确认，叠在设置弹窗上 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="dangerOutlined" size="m" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
      <div className={styles.importOptions}>
        <div className={styles.importOptionRow}>
          <span className={styles.importOptionLabel}>{t('historyImportModeLabel')}</span>
          <Select
            value={historyImport.mode}
            ariaLabel={t('historyImportModeLabel')}
            options={[
              { value: 'merge', label: t('historyImportModeMerge') },
              { value: 'replace', label: t('historyImportModeReplace') },
            ]}
            onChange={historyImport.setMode}
          />
        </div>
        {historyImport.mode === 'merge' ? (
          <div className={styles.importOptionRow}>
            <span className={styles.importOptionLabel}>{t('historyImportConflictLabel')}</span>
            <Select
              value={historyImport.resolution}
              ariaLabel={t('historyImportConflictLabel')}
              options={[
                { value: 'keepBoth', label: t('historyImportConflictBoth') },
                { value: 'keepLocal', label: t('historyImportConflictLocal') },
                { value: 'keepImported', label: t('historyImportConflictImported') },
              ]}
              onChange={historyImport.setResolution}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 用量计费设置：token 单价与上下文窗口。
 * 单价留空表示未配置，费用显示「待配置」，不使用任何猜测价格。
 */
const UsageSetting = () => {
  const t = useTranslate()
  const pricingInput = useSettings((state) => state.pricingInput)
  const pricingOutput = useSettings((state) => state.pricingOutput)
  const contextWindow = useSettings((state) => state.contextWindow)

  const commitPrice = (value: string, apply: (price: number | null) => void) => {
    apply(parsePrice(value))
  }
  const commitWindow = (value: string) => {
    const parsed = parseContextWindow(value)
    if (parsed !== null) {
      setContextWindow(parsed)
    }
  }

  return (
    <>
      <SettingCell
        label={t('settingsPricingInput')}
        description={t('settingsPricingUnit')}
        status={null}
        action={
          <input
            type="number"
            min={0}
            step="0.0001"
            inputMode="decimal"
            className={styles.numberInput}
            aria-label={t('settingsPricingInput')}
            defaultValue={pricingInput ?? ''}
            placeholder={t('usageCostUnset')}
            onBlur={(event) => commitPrice(event.target.value, setPricingInput)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitPrice(event.currentTarget.value, setPricingInput)
              }
            }}
          />
        }
      />
      <SettingCell
        label={t('settingsPricingOutput')}
        description={t('settingsPricingHint')}
        status={null}
        action={
          <input
            type="number"
            min={0}
            step="0.0001"
            inputMode="decimal"
            className={styles.numberInput}
            aria-label={t('settingsPricingOutput')}
            defaultValue={pricingOutput ?? ''}
            placeholder={t('usageCostUnset')}
            onBlur={(event) => commitPrice(event.target.value, setPricingOutput)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitPrice(event.currentTarget.value, setPricingOutput)
              }
            }}
          />
        }
      />
      <SettingCell
        label={t('settingsContextWindow')}
        description={t('settingsContextWindowHint')}
        status={null}
        action={
          <input
            type="number"
            min={MIN_CONTEXT_WINDOW}
            max={MAX_CONTEXT_WINDOW}
            step="1000"
            inputMode="numeric"
            className={styles.numberInput}
            aria-label={t('settingsContextWindow')}
            defaultValue={contextWindow}
            onBlur={(event) => commitWindow(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitWindow(event.currentTarget.value)
              }
            }}
          />
        }
      />
    </>
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 导入/导出进度条：仅在任务进行中显示，按百分比平滑推进 */
const ProgressBar = ({ percent }: { percent: number }) => {
  const value = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div
      className={styles.progressBar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      data-testid="progress-bar"
      data-percent={value}
    >
      <div className={styles.progressFill} style={{ width: `${value}%` }} />
    </div>
  )
}

/** 选文件后先提示导入方式；确认后才检查文件并执行导入，任何错误都提示导入失败。 */
const useHistoryImport = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [resolution, setResolution] = useState<ConflictResolution>('keepBoth')
  const [progress, setProgress] = useState(0)
  const importing = useRef(false)

  const confirm = async () => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setBusy(true)
    setStatus(null)
    setProgress(0)
    try {
      const count = await importHistory(file, { mode, resolution }, setProgress)
      setStatus({ key: count === 1 ? 'historyImportedOne' : 'historyImported', params: { count } })
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      importing.current = false
      setProgress(0)
      setBusy(false)
    }
  }

  return {
    file,
    busy,
    status,
    progress,
    mode,
    setMode,
    resolution,
    setResolution,
    select: setFile,
    cancel: () => setFile(null),
    confirm,
  }
}

/** 导入 = 覆盖：用选中文件替换本地全部会话与附件。 */
const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <SettingCell
        label={t('historyImport')}
        description={t('historyImportDescription')}
        status={historyImport.status}
        action={
          <>
            <Button
              variant="outlined"
              size="m"
              className={clsx(styles.cellButton, styles.uploadButton)}
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <IconUploadOutline14 />
              {t('upload')}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) {
                  historyImport.select(file)
                }
              }}
            />
          </>
        }
      />
      {historyImport.busy ? <ProgressBar percent={historyImport.progress} /> : null}
    </>
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [progress, setProgress] = useState(0)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    setProgress(0)
    try {
      const { name, blob } = await exportHistory(setProgress)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setProgress(0)
      setBusy(false)
    }
  }

  return (
    <>
      <SettingCell
        label={t('exportAllLabel')}
        description={t('historyExportDescription')}
        status={status}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={disabled || busy || empty}
            onClick={() => void onExport()}
          >
            <IconDownloadOutline16 />
            {t('exportAllDownload')}
          </Button>
        }
      />
      {busy ? <ProgressBar percent={progress} /> : null}
    </>
  )
}


/** 主色预设：选中即写回设置，由 theme.ts 的订阅派生整套品牌令牌 */
const AccentSetting = () => {
  const t = useTranslate()
  const themePreset = useSettings((state) => state.themePreset)
  const customBrand = useSettings((state) => state.customBrand)
  return (
    <div className={styles.accent}>
      <div className={styles.label}>{t('settingsAccent')}</div>
      <div role="radiogroup" aria-label={t('settingsAccent')} className={styles.accentOptions}>
        {accentPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={themePreset === preset.id}
            className={clsx(
              styles.accentOption,
              themePreset === preset.id && styles.accentOptionSelected
            )}
            onClick={() => setThemePreset(preset.id)}
          >
            <span className={styles.swatch} style={{ backgroundColor: preset.brand }} />
            {t(preset.label as TranslationKey)}
          </button>
        ))}
        <label
          className={clsx(
            styles.accentOption,
            themePreset === CUSTOM_PRESET_ID && styles.accentOptionSelected
          )}
        >
          <span
            className={styles.swatch}
            style={{ backgroundColor: customBrand ?? presetBrand(CUSTOM_PRESET_ID) }}
          />
          {t('settingsAccentCustom')}
          <input
            type="color"
            className={styles.colorInput}
            aria-label={t('settingsAccentCustom')}
            value={customBrand ?? presetBrand(CUSTOM_PRESET_ID)}
            onChange={(event) => {
              setCustomBrand(event.target.value)
              setThemePreset(CUSTOM_PRESET_ID)
            }}
          />
        </label>
      </div>
    </div>
  )
}

/** 字体缩放滑杆：写入根元素 CSS 变量，只影响显示 */
const FontSlider = ({
  value,
  label,
  onChange,
}: {
  value: number
  label: string
  onChange: (value: number) => void
}) => (
  <div className={styles.slider}>
    <input
      type="range"
      min={60}
      max={200}
      step={5}
      value={value}
      aria-label={label}
      className={styles.range}
      onChange={(event) => {
        onChange(Number(event.target.value))
        applyFontScale()
      }}
    />
    <span className={styles.rangeValue}>{value}%</span>
  </div>
)

const FontSetting = () => {
  const t = useTranslate()
  const fontText = useSettings((state) => state.fontText)
  const fontCode = useSettings((state) => state.fontCode)
  const fontThinking = useSettings((state) => state.fontThinking)
  return (
    <>
      <SettingCell
        label={t('settingsFontText')}
        description={t('settingsFontHint')}
        status={null}
        action={<FontSlider value={fontText} label={t('settingsFontText')} onChange={setFontText} />}
      />
      <SettingCell
        label={t('settingsFontCode')}
        status={null}
        action={<FontSlider value={fontCode} label={t('settingsFontCode')} onChange={setFontCode} />}
      />
      <SettingCell
        label={t('settingsFontThinking')}
        status={null}
        action={
          <FontSlider
            value={fontThinking}
            label={t('settingsFontThinking')}
            onChange={setFontThinking}
          />
        }
      />
      <SettingCell
        label={t('settingsFontReset')}
        status={null}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            onClick={() => {
              setFontText(100)
              setFontCode(100)
              setFontThinking(100)
              applyFontScale()
            }}
          >
            {t('settingsFontReset')}
          </Button>
        }
      />
    </>
  )
}

const FadeSetting = () => {
  const t = useTranslate()
  const fadeOutput = useSettings((state) => state.fadeOutput)
  return (
    <SettingCell
      label={t('settingsFadeOutput')}
      description={t('settingsFadeOutputHint')}
      status={null}
      action={
        <Toggle checked={fadeOutput} label={t('settingsFadeOutput')} onChange={setFadeOutput} />
      }
    />
  )
}

const QueueSetting = () => {
  const t = useTranslate()
  const queueEnabled = useSettings((state) => state.queueEnabled)
  const queueMode = useSettings((state) => state.queueMode)
  const modeOptions: { value: QueueMode; label: string }[] = [
    { value: 'keep', label: t('settingsQueueKeep') },
    { value: 'last', label: t('settingsQueueLast') },
  ]
  return (
    <>
      <SettingCell
        label={t('settingsQueueEnabled')}
        description={t('settingsQueueEnabledHint')}
        status={null}
        action={
          <Toggle
            checked={queueEnabled}
            label={t('settingsQueueEnabled')}
            onChange={setQueueEnabled}
          />
        }
      />
      <SettingCell
        label={t('settingsQueueMode')}
        status={null}
        action={
          <Select
            value={queueMode}
            options={modeOptions}
            ariaLabel={t('settingsQueueMode')}
            disabled={!queueEnabled}
            onChange={(value) => setQueueMode(value)}
          />
        }
      />
    </>
  )
}

/** 提示词输入：失焦或回车保存，避免每次按键写 localStorage */
const PromptInput = ({
  value,
  label,
  onCommit,
}: {
  value: string
  label: string
  onCommit: (value: string) => void
}) => (
  <textarea
    className={styles.promptInput}
    aria-label={label}
    defaultValue={value}
    rows={3}
    onBlur={(event) => onCommit(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        onCommit(event.currentTarget.value)
        event.currentTarget.blur()
      }
    }}
  />
)

const PromptSetting = () => {
  const t = useTranslate()
  const systemPrompt = useSettings((state) => state.systemPrompt)
  const firstTurnPrompt = useSettings((state) => state.firstTurnPrompt)
  return (
    <>
      <SettingCell
        label={t('settingsSystemPrompt')}
        description={t('settingsSystemPromptHint')}
        status={null}
        action={
          <PromptInput
            value={systemPrompt}
            label={t('settingsSystemPrompt')}
            onCommit={(next) => {
              setSystemPrompt(next)
              showToast(t('settingsPromptSaved'))
            }}
          />
        }
      />
      <SettingCell
        label={t('settingsFirstTurn')}
        description={t('settingsFirstTurnHint')}
        status={null}
        action={
          <PromptInput
            value={firstTurnPrompt}
            label={t('settingsFirstTurn')}
            onCommit={(next) => {
              setFirstTurnPrompt(next)
              showToast(t('settingsPromptSaved'))
            }}
          />
        }
      />
    </>
  )
}

const WORD_FONTS: { value: string; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'yahei', label: 'Microsoft YaHei' },
  { value: 'simsun', label: 'SimSun' },
  { value: 'simhei', label: 'SimHei' },
  { value: 'kaiti', label: 'KaiTi' },
  { value: 'times', label: 'Times New Roman' },
]

const WordSetting = () => {
  const t = useTranslate()
  const wordExportEnabled = useSettings((state) => state.wordExportEnabled)
  const wordFontFamily = useSettings((state) => state.wordFontFamily)
  const wordFontSize = useSettings((state) => state.wordFontSize)
  const wordColor = useSettings((state) => state.wordColor)
  return (
    <>
      <SettingCell
        label={t('settingsWordEnabled')}
        description={t('settingsWordEnabledHint')}
        status={null}
        action={
          <Toggle
            checked={wordExportEnabled}
            label={t('settingsWordEnabled')}
            onChange={setWordExportEnabled}
          />
        }
      />
      <SettingCell
        label={t('settingsWordFont')}
        status={null}
        action={
          <Select
            value={wordFontFamily}
            options={WORD_FONTS}
            ariaLabel={t('settingsWordFont')}
            onChange={(value) => setWordFontFamily(value)}
          />
        }
      />
      <SettingCell
        label={t('settingsWordSize')}
        status={null}
        action={
          <input
            type="number"
            min={8}
            max={32}
            step={1}
            inputMode="numeric"
            className={styles.numberInput}
            aria-label={t('settingsWordSize')}
            defaultValue={wordFontSize}
            onBlur={(event) => setWordFontSize(Number(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setWordFontSize(Number(event.currentTarget.value))
              }
            }}
          />
        }
      />
      <SettingCell
        label={t('settingsWordColor')}
        status={null}
        action={
          <input
            type="color"
            className={styles.colorInput}
            aria-label={t('settingsWordColor')}
            value={wordColor}
            onChange={(event) => setWordColor(event.target.value)}
          />
        }
      />
      <SettingCell
        label={t('settingsWordPreview')}
        status={null}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            onClick={() => {
              const name = downloadWord(
                '# Hello\n\n这是一份导出样式样例，用来确认字体、字号与颜色。\n\n- 列表项一\n- 列表项二\n\n`inline code` 与 **加粗** 文本。',
                {
                  title: t('settingsWordPreview'),
                  fontSize: wordFontSize,
                  fontFamily: wordFontFamily,
                  color: wordColor,
                  withMeta: true,
                  baseName: 'DeepSeek-sample',
                }
              )
              showToast(t('exportWordDone', { name }))
            }}
          >
            {t('exportWord')}
          </Button>
        }
      />
    </>
  )
}

const LogsSetting = () => {
  const t = useTranslate()
  return (
    <SettingCell
      label={t('settingsLogsExport')}
      description={t('settingsLogsHint')}
      status={null}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          onClick={() => {
            const state = useSettings.getState()
            const name = downloadLog({
              locale: state.locale,
              themePreference: state.themePreference,
              themePreset: state.themePreset,
              queueEnabled: state.queueEnabled,
              queueMode: state.queueMode,
              fadeOutput: state.fadeOutput,
              contextWindow: state.contextWindow,
              hasApiKey: Boolean(state.apiKey),
              userAgent: navigator.userAgent,
            })
            showToast(t('settingsLogsDone', { name }))
          }}
        >
          {t('settingsLogsExport')}
        </Button>
      }
    />
  )
}

const RestoreSetting = () => {
  const t = useTranslate()
  const restoreMode = useSettings((state) => state.restoreMode)
  const options: { value: RestoreMode; label: string }[] = [
    { value: 'ask', label: t('settingsRestoreAsk') },
    { value: 'always', label: t('settingsRestoreAlways') },
    { value: 'off', label: t('settingsRestoreOff') },
  ]
  return (
    <SettingCell
      label={t('settingsRestoreGroup')}
      description={t('settingsRestoreOff')}
      status={null}
      action={
        <Select
          value={restoreMode}
          options={options}
          ariaLabel={t('settingsRestoreGroup')}
          onChange={(value) => setRestoreMode(value)}
        />
      }
    />
  )
}
