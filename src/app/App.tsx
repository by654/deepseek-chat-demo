import clsx from 'clsx'
import { useEffect } from 'react'
import { useTranslate } from '../i18n/index.js'
import { applyFontScale, useSettings } from '../services/settings.js'
import { useIsMobile, useMobileViewport, usePreventPageScroll } from './viewport.js'
import {
  bindChatPersistence,
  initChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { startCloudSync } from '../services/sync/cloudSync.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { OnboardingDialog } from '../components/onboarding/OnboardingDialog.js'
import { SelectionQuote } from '../components/messages/SelectionQuote.js'
import { RestorePrompt } from '../components/session/RestorePrompt.js'
import { saveLastSession } from '../services/chat/sessionMemory.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { MobileSider, Sider } from '../components/sider/Sider.js'
import { CommandPalette, installShortcuts } from '../components/features/CommandPalette.js'
import { LibraryDialog } from '../components/features/LibraryDialog.js'
import { CompareDialog } from '../components/features/CompareDialog.js'
import { LockScreen } from '../components/features/LockScreen.js'
import { VersionBanner } from '../components/features/VersionBanner.js'
import { BudgetAlert } from '../components/features/BudgetAlert.js'
import { AnnouncementBanner } from '../components/features/AnnouncementBanner.js'
import { SharedSessionPage } from '../components/features/SharedSessionPage.js'
import { MfaGate } from '../components/account/MfaGate.js'
import { loadStars } from '../services/stars.js'
import { setLibraryView, useLibrary } from '../services/library.js'
import styles from './App.module.css'

/** 应用入口：分享链接单独渲染只读页，其余进入聊天主界面 */
export const App = () => {
  const shareId = new URLSearchParams(window.location.search).get('share')
  return shareId ? <SharedSessionPage id={shareId} /> : <ChatApp />
}

const ChatApp = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)
  const fadeOutput = useSettings((state) => state.fadeOutput)
  const fontText = useSettings((state) => state.fontText)
  const fontCode = useSettings((state) => state.fontCode)
  const fontThinking = useSettings((state) => state.fontThinking)
  const density = useSettings((state) => state.density)
  const contentWidth = useSettings((state) => state.contentWidth)
  const readingMode = useSettings((state) => state.readingMode)
  const libraryView = useLibrary((state) => state.view)

  usePreventPageScroll(isMobile)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 字体缩放：设置变化时重新写入根元素的 CSS 变量
  useEffect(() => {
    applyFontScale()
  }, [fontText, fontCode, fontThinking])

  // 淡化输出开关：样式层通过该属性决定是否给新消息加淡入
  useEffect(() => {
    document.documentElement.dataset.fadeOutput = fadeOutput ? 'on' : 'off'
  }, [fadeOutput])

  // 密度与正文宽度：新增的界面偏好通过根元素属性与 CSS 变量生效
  useEffect(() => {
    const root = document.documentElement
    root.dataset.density = density
    root.dataset.reading = readingMode ? 'on' : 'off'
    root.style.setProperty('--message-list-max-width', `${contentWidth}px`)
    return () => {
      root.style.removeProperty('--message-list-max-width')
    }
  }, [density, contentWidth, readingMode])

  // 全局快捷键：Ctrl+K 命令面板、Ctrl+Shift+N 新对话
  useEffect(() => installShortcuts(), [])

  // 记录当前会话，供下次打开时的「继续上次聊天」使用
  useEffect(() => {
    saveLastSession(activeId)
  }, [activeId])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])
  // 恢复登录态并开启云端同步（含跨端实时订阅）；未登录时只做本地存储
  useEffect(startCloudSync, [])
  // 素材库列表
  useEffect(() => {
    void loadStars()
  }, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    // 分享导入后带 ?session=<id> 回到主界面：初始化完成后直接打开该会话
    void initChat().then(() => {
      const target = new URLSearchParams(window.location.search).get('session')
      if (!target) {
        return
      }
      selectSession(target)
      const url = new URL(window.location.href)
      url.searchParams.delete('session')
      window.history.replaceState(null, '', url.toString())
    })
  }, [])

  // 已完成引导但没填 API Key 时，打开设置的数据页提醒补充
  useEffect(() => {
    if (ready && useSettings.getState().onboardingDone) {
      ensureApiKey()
    }
  }, [ready])

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? (
          <MobileSider />
        ) : readingMode ? null : (
          <div
            className={clsx(styles.siderSlot, siderCollapsed && styles.siderSlotCollapsed)}
            aria-hidden={siderCollapsed}
            data-reading-hide
          >
            <Sider />
          </div>
        )}
        <main className={styles.main}>
          <BudgetAlert />
          <AnnouncementBanner />
          {libraryView !== 'active' ? (
            <div className={styles.libraryNotice} role="status">
              <span>{libraryView === 'archived' ? '正在查看归档会话' : '回收站保留 30 天，可恢复'}</span>
              <button
                type="button"
                className={styles.libraryNoticeAction}
                onClick={() => setLibraryView('active')}
              >
                返回全部
              </button>
            </div>
          ) : null}
          <VersionBanner />
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {siderCollapsed ? <CollapsedSider /> : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
      </div>
      <SelectionQuote />
      <RestorePrompt />
      <OnboardingDialog />
      <SettingsDialog />
      <CommandPalette />
      <LibraryDialog />
      <CompareDialog />
      <LockScreen />
      <MfaGate />
      <Toast />
    </>
  )
}
