import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import {
  searchChats,
  splitHighlight,
  DEFAULT_FILTERS,
  refreshSearchIndex,
  type SearchFilters,
  type SearchResult,
  type SearchRange,
} from '../../services/search.js'
import {
  clearSearchHistory,
  recordSearch,
  setActiveWorkspace,
  setLibraryView,
  togglePinnedSearch,
  useLibrary,
} from '../../services/library.js'
import { newChat, selectSession } from '../../services/chat/store.js'
import { requestJump } from '../../services/chat/jump.js'
import { openSettings } from '../settings/settingsDialogState.js'
import {
  closeCommandPalette,
  openCommandPalette,
  openCompareDialog,
  useCommandPalette,
} from './commandPaletteState.js'
import {
  IconArchiveOutline16,
  IconCommandOutline16,
  IconCompareOutline16,
  IconLibraryOutline16,
  IconLockOutline16,
  IconSearchOutline16,
  IconStarOutline16,
  IconTemplateOutline16,
  IconTrashOutline16,
} from './icons.js'
import { IconSearchOutline16 as IconSearch } from '../base/icons.js'
import { openLibrary } from './libraryState.js'
import { lockNow } from '../../services/security.js'
import { setReadingMode, setThemePreference, useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'
import styles from './features.module.css'

type Action = {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  run: () => void
}

const formatTime = (time: number) => {
  const date = new Date(time)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}-${date.getDate()}`
}

const useActions = (): Action[] => {
  const t = useTranslate()
  const theme = useSettings((state) => state.themePreference)
  const reading = useSettings((state) => state.readingMode)
  return [
    {
      id: 'new',
      label: t('newChat'),
      hint: 'Ctrl+Shift+N',
      icon: <IconCommandOutline16 />,
      run: newChat,
    },
    {
      id: 'library',
      label: '素材库与资料库',
      hint: '素材 / 模板 / 提示词 / 片段',
      icon: <IconLibraryOutline16 />,
      run: () => openLibrary('stars'),
    },
    {
      id: 'templates',
      label: '会话模板',
      hint: '一键起新会话',
      icon: <IconTemplateOutline16 />,
      run: () => openLibrary('templates'),
    },
    {
      id: 'archive',
      label: '归档区',
      hint: '不占主列表，可搜索',
      icon: <IconArchiveOutline16 />,
      run: () => {
        setLibraryView('archived')
        setActiveWorkspace(null)
      },
    },
    {
      id: 'trash',
      label: '回收站',
      hint: '30 天内可恢复',
      icon: <IconTrashOutline16 />,
      run: () => {
        setLibraryView('trash')
        setActiveWorkspace(null)
      },
    },
    {
      id: 'compare',
      label: '双模型并排对比',
      hint: 'Flash / Pro 各答一次',
      icon: <IconCompareOutline16 />,
      run: () => openCompareDialog(''),
    },
    {
      id: 'reading',
      label: reading ? '退出阅读模式' : '进入阅读模式',
      hint: '隐藏侧栏与操作按钮',
      icon: <IconStarOutline16 />,
      run: () => setReadingMode(!reading),
    },
    {
      id: 'theme',
      label: theme === 'dark' ? '切换到浅色主题' : '切换到深色主题',
      hint: '外观',
      icon: <IconStarOutline16 />,
      run: () => setThemePreference(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'lock',
      label: '立即锁定界面',
      hint: '需要已设置 PIN',
      icon: <IconLockOutline16 />,
      run: () => {
        if (!useSettings.getState().lockPinHash) {
          showToast({ key: 'lockPinNotSet', type: 'error' })
          return
        }
        lockNow()
      },
    },
    {
      id: 'settings',
      label: t('settings'),
      hint: '打开设置',
      icon: <IconCommandOutline16 />,
      run: () => openSettings('general'),
    },
  ]
}

export const CommandPalette = () => {
  const open = useCommandPalette((state) => state.open)
  return open ? <Palette /> : null
}

const Palette = () => {
  const history = useLibrary((state) => state.searchHistory)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [result, setResult] = useState<SearchResult>({ sessions: [], messages: [] })
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const actions = useActions()

  useEffect(() => {
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        await refreshSearchIndex()
        const next = await searchChats(query, filters)
        if (alive) {
          setResult(next)
        }
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }, 160)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query, filters])

  useEffect(() => {
    if (!query.trim() || loading) {
      return
    }
    const timer = window.setTimeout(() => recordSearch(query), 700)
    return () => window.clearTimeout(timer)
  }, [query, loading])

  const actionItems = useMemo(() => {
    const text = query.trim().toLowerCase()
    return actions.filter(
      (action) =>
        !text ||
        action.label.toLowerCase().includes(text) ||
        action.hint.toLowerCase().includes(text)
    )
  }, [actions, query])

  const go = (run: () => void) => {
    run()
    closeCommandPalette()
  }

  const openJump = (sessionId: string, messageId: string) => {
    selectSession(sessionId)
    requestJump(sessionId, messageId, query.trim())
    closeCommandPalette()
  }

  const onMove = (delta: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('[data-palette-item]')
    if (!items || items.length === 0) {
      return
    }
    const current = [...items].findIndex((item) => item === document.activeElement)
    const next =
      current < 0
        ? delta > 0
          ? 0
          : items.length - 1
        : (current + delta + items.length) % items.length
    items[next]?.focus()
  }

  const filterChip = (active: boolean) => clsx(styles.chip, active && styles.chipActive)

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => event.target === event.currentTarget && closeCommandPalette()}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="命令面板">
        <div className={styles.paletteHead}>
          <IconSearch />
          <input
            ref={inputRef}
            className={styles.paletteInput}
            placeholder="搜索会话、消息，或输入命令…"
            value={query}
            aria-label="搜索会话与消息"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                closeCommandPalette()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                onMove(1)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                onMove(-1)
              } else if (event.key === 'Enter') {
                const active = document.activeElement as HTMLElement | null
                if (active?.dataset.paletteItem) {
                  active.click()
                }
              }
            }}
          />
          <span className={styles.kbd}>Esc</span>
        </div>
        <div className={styles.filterRow}>
          {(['all', '7d', '30d', 'year'] as SearchRange[]).map((range) => (
            <button
              key={range}
              type="button"
              className={filterChip(filters.range === range)}
              onClick={() => setFilters((current) => ({ ...current, range }))}
            >
              {range === 'all' ? '全部时间' : range === '7d' ? '7 天' : range === '30d' ? '30 天' : '一年'}
            </button>
          ))}
          <button
            type="button"
            className={filterChip(filters.model === 'all')}
            onClick={() => setFilters((current) => ({ ...current, model: 'all' }))}
          >
            全部模型
          </button>
          <button
            type="button"
            className={filterChip(filters.model === 'deepseek-flash')}
            onClick={() => setFilters((current) => ({ ...current, model: 'deepseek-flash' }))}
          >
            Flash
          </button>
          <button
            type="button"
            className={filterChip(filters.model === 'deepseek-v4-pro')}
            onClick={() => setFilters((current) => ({ ...current, model: 'deepseek-v4-pro' }))}
          >
            Pro
          </button>
          <button
            type="button"
            className={filterChip(filters.hasFiles)}
            onClick={() => setFilters((current) => ({ ...current, hasFiles: !current.hasFiles }))}
          >
            带附件
          </button>
        </div>
        <div ref={listRef} className={styles.resultList}>
          {!query.trim() && history.length > 0 ? (
            <>
              <div className={styles.sectionLabel}>搜索历史</div>
              <div className={styles.tagRow} style={{ padding: '0 12px 6px' }}>
                {history.slice(0, 8).map((item) => (
                  <span key={item.query} className={styles.tag}>
                    <button
                      type="button"
                      className={styles.bannerAction}
                      onClick={() => setQuery(item.query)}
                    >
                      {item.query}
                    </button>
                    <button
                      type="button"
                      className={styles.bannerClose}
                      aria-label={item.pinned ? '取消固定' : '固定搜索词'}
                      onClick={() => togglePinnedSearch(item.query)}
                    >
                      {item.pinned ? '★' : '☆'}
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className={styles.bannerClose}
                  aria-label="清空搜索历史"
                  onClick={clearSearchHistory}
                >
                  ×
                </button>
              </div>
            </>
          ) : null}

          {actionItems.length > 0 ? <div className={styles.sectionLabel}>操作</div> : null}
          {actionItems.map((action) => (
            <button
              key={action.id}
              type="button"
              data-palette-item
              className={styles.resultItem}
              onClick={() => go(action.run)}
            >
              <span className={styles.resultIcon}>{action.icon}</span>
              <span className={styles.resultMain}>
                <span className={styles.resultTitle}>{action.label}</span>
                <span className={styles.resultMeta}>{action.hint}</span>
              </span>
            </button>
          ))}

          {result.sessions.length > 0 ? <div className={styles.sectionLabel}>会话</div> : null}
          {result.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              data-palette-item
              className={styles.resultItem}
              onClick={() => go(() => selectSession(session.id))}
            >
              <span className={styles.resultIcon}>
                <IconSearchOutline16 />
              </span>
              <span className={styles.resultMain}>
                <span className={styles.resultTitle}>
                  {session.title}
                  {session.archived ? <span className={styles.badge}>归档</span> : null}
                </span>
                <span className={styles.resultMeta}>更新于 {formatTime(session.updatedAt)}</span>
              </span>
            </button>
          ))}

          {result.messages.length > 0 ? <div className={styles.sectionLabel}>消息命中</div> : null}
          {result.messages.map((hit) => (
            <button
              key={`${hit.sessionId}:${hit.messageId}`}
              type="button"
              data-palette-item
              className={styles.resultItem}
              onClick={() => openJump(hit.sessionId, hit.messageId)}
            >
              <span className={styles.resultIcon}>
                {hit.role === 'user' ? <IconSearchOutline16 /> : <IconStarOutline16 />}
              </span>
              <span className={styles.resultMain}>
                <span className={styles.resultTitle}>
                  {hit.sessionTitle}
                  <span className={styles.badge}>{hit.role === 'user' ? '我的提问' : hit.model ?? '回答'}</span>
                  {hit.archived ? <span className={styles.badge}>归档</span> : null}
                </span>
                <span className={styles.resultSnippet}>
                  {splitHighlight(hit.snippet, query).map((part, index) =>
                    part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
                  )}
                </span>
                {hit.before.length > 0 || hit.after.length > 0 ? (
                  <span className={styles.contextRow}>
                    上文：{hit.before.at(-1)?.text.slice(0, 50) ?? '—'} · 下文：
                    {hit.after[0]?.text.slice(0, 50) ?? '—'}
                  </span>
                ) : null}
                <span className={styles.resultMeta}>{formatTime(hit.createdAt)}</span>
              </span>
            </button>
          ))}

          {actionItems.length === 0 && result.sessions.length === 0 && result.messages.length === 0 ? (
            <div className={styles.empty}>
              {loading ? '正在搜索…' : `没有找到与「${query.trim()}」相关的内容`}
            </div>
          ) : null}
        </div>
        <div className={styles.paletteFoot}>
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span className={styles.kbd}>Ctrl K</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 全站快捷键：Ctrl/Cmd+K 打开命令面板，Ctrl/Cmd+Shift+N 新建对话。 */
export const installShortcuts = () => {
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (useCommandPalette.getState().open) {
        closeCommandPalette()
      } else {
        openCommandPalette()
      }
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      newChat()
    }
  }
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}
