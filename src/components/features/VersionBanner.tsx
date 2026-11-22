import { useState } from 'react'
import { Modal } from '../base/Modal.js'
import { Button } from '../base/Button.js'
import styles from './features.module.css'

const VERSION_KEY = 'chat-demo:seen-version'

const currentVersion = () =>
  document.querySelector('meta[name="application-version"]')?.getAttribute('content') ?? ''

const CHANGELOG: { version: string; items: string[] }[] = [
  {
    version: '0.2.0',
    items: [
      '会话归档区、30 天回收站、文件夹与标签、置顶拖拽排序',
      '素材库（星标消息）、会话模板、工作区、会话快照与克隆',
      '命令面板 Ctrl+K：跨会话全文搜索、高亮上下文、搜索历史与筛选',
      '斜杠指令、提示词变量、片段库、@ 引用会话、附件排序与备注、就地改写',
      '双模型对比、表格导出 CSV、会话导出 Markdown / PDF、语音导出、代码沙箱',
      '用量报表、月度预算、单会话费用上限、上下文裁剪、响应缓存、多 Key 轮换',
      '锁屏与隐藏会话、导出脱敏、阅读模式、PWA 安装与版本更新提示',
    ],
  },
]

/** 版本更新提示：与上次看到的版本不同时在顶部显示，可查看变更日志。 */
export const VersionBanner = () => {
  const version = currentVersion()
  const [visible, setVisible] = useState(() => {
    if (!version) {
      return false
    }
    try {
      return localStorage.getItem(VERSION_KEY) !== version
    } catch {
      return false
    }
  })
  const [changelog, setChangelog] = useState(false)

  if (!visible) {
    return null
  }

  const dismiss = () => {
    try {
      localStorage.setItem(VERSION_KEY, version)
    } catch {
      // 忽略
    }
    setVisible(false)
  }

  return (
    <>
      <div className={styles.banner} role="status">
        <span>已更新至 v{version}</span>
        <button type="button" className={styles.bannerAction} onClick={() => setChangelog(true)}>
          查看变更
        </button>
        <button type="button" className={styles.bannerClose} aria-label="关闭更新提示" onClick={dismiss}>
          ×
        </button>
      </div>
      {changelog ? (
        <Modal
          title="变更日志"
          closable
          className={styles.snapshotModal}
          onClose={() => {
            setChangelog(false)
            dismiss()
          }}
          footer={
            <Button size="m" onClick={dismiss}>
              知道了
            </Button>
          }
        >
          <div className={styles.dialogBody}>
            {CHANGELOG.map((entry) => (
              <div key={entry.version}>
                <div className={styles.cardTitle}>v{entry.version}</div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: 'var(--ui-text-2)', lineHeight: 1.8 }}>
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
