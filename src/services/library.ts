import { create } from 'zustand'
import type { ChatModel } from './api/types.js'
import { setSessionModel } from './chat/model.js'
import { createId } from '../utils/id.js'

/**
 * 会话组织与个人资料库：工作区、文件夹、提示词、片段、模板与搜索历史。
 * 都是本机配置，存 localStorage；会话本身仍存 IndexedDB。
 */

export type Workspace = {
  id: string
  name: string
  color: string
  systemPrompt: string
  model: ChatModel | null
  personaId: string | null
  createdAt: number
}

export type Folder = {
  id: string
  name: string
  /** 上级文件夹；null 为顶层。用于多级分组。 */
  parentId: string | null
  createdAt: number
}

export type Persona = {
  id: string
  name: string
  prompt: string
  createdAt: number
}

export type Snippet = {
  id: string
  name: string
  text: string
  createdAt: number
}

export type SessionTemplate = {
  id: string
  name: string
  description: string
  prompt: string
  model: ChatModel | null
  systemPrompt: string
  personaId: string | null
  workspaceId: string | null
  /** 开场附件只保存可复现的文本内容。 */
  attachments: { name: string; text: string }[]
  createdAt: number
}

export type SearchHistoryItem = {
  query: string
  at: number
  pinned: boolean
}

/** 侧栏当前视图：正常 / 归档 / 回收站 */
export type SessionView = 'active' | 'archived' | 'trash'

type LibraryState = {
  workspaces: Workspace[]
  folders: Folder[]
  personas: Persona[]
  snippets: Snippet[]
  templates: SessionTemplate[]
  searchHistory: SearchHistoryItem[]
  activeWorkspaceId: string | null
  folderFilter: string | null
  tagFilter: string | null
  view: SessionView
  activePersonaId: string | null
  /** 选定工作区时新会话继承的模型，用于输入框展示 */
  pendingWorkspaceId: string | null
  /** 模板带入、等待新会话消费的系统提示词 */
  pendingSystemPrompt: string | null
}

const STORAGE_KEY = 'chat-demo:library'

const now = () => Date.now()

const seed = (): LibraryState => {
  const at = now()
  return {
    workspaces: [
      {
        id: 'work',
        name: '工作',
        color: '#4d6bfe',
        systemPrompt: '',
        model: null,
        personaId: null,
        createdAt: at,
      },
      {
        id: 'study',
        name: '学习',
        color: '#12a594',
        systemPrompt: '',
        model: null,
        personaId: null,
        createdAt: at,
      },
    ],
    folders: [],
    personas: [
      {
        id: 'persona-concise',
        name: '简洁回答',
        prompt: '请直接给出结论，避免客套与重复；必要时再用短列表补充要点。',
        createdAt: at,
      },
      {
        id: 'persona-teacher',
        name: '耐心讲解',
        prompt: '假设我是初学者，请先给直觉解释，再给步骤与例子，最后总结关键点。',
        createdAt: at,
      },
    ],
    snippets: [
      {
        id: 'snippet-review',
        name: '代码审查',
        text: '请按正确性、边界条件、可读性、性能与安全性审查下面的代码，并给出可直接采用的修改建议：\n',
        createdAt: at,
      },
      {
        id: 'snippet-signature',
        name: '工作邮件结尾',
        text: '——\n如需进一步讨论，欢迎随时回复。',
        createdAt: at,
      },
    ],
    templates: [],
    searchHistory: [],
    activeWorkspaceId: null,
    folderFilter: null,
    tagFilter: null,
    view: 'active',
    activePersonaId: null,
    pendingWorkspaceId: null,
    pendingSystemPrompt: null,
  }
}

const read = (): LibraryState => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') {
      return seed()
    }
    const value = saved as Partial<LibraryState>
    const base = seed()
    const list = <T>(input: unknown, fallback: T[]): T[] =>
      Array.isArray(input) ? (input as T[]) : fallback
    return {
      workspaces: list(value.workspaces, base.workspaces),
      folders: list<Partial<Folder>>(value.folders, base.folders).map((folder) => ({
        ...folder,
        parentId: folder.parentId ?? null,
      })) as Folder[],
      personas: list(value.personas, base.personas),
      snippets: list(value.snippets, base.snippets),
      templates: list(value.templates, base.templates),
      searchHistory: list(value.searchHistory, base.searchHistory),
      activeWorkspaceId: value.activeWorkspaceId ?? null,
      folderFilter: value.folderFilter ?? null,
      tagFilter: value.tagFilter ?? null,
      view:
        value.view === 'archived' || value.view === 'trash' || value.view === 'active'
          ? value.view
          : 'active',
      activePersonaId: value.activePersonaId ?? null,
      pendingWorkspaceId: value.pendingWorkspaceId ?? null,
      pendingSystemPrompt: value.pendingSystemPrompt ?? null,
    }
  } catch {
    return seed()
  }
}

export const useLibrary = create<LibraryState>(() => read())

useLibrary.subscribe((state) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workspaces: state.workspaces,
        folders: state.folders,
        personas: state.personas,
        snippets: state.snippets,
        templates: state.templates,
        searchHistory: state.searchHistory,
        activeWorkspaceId: state.activeWorkspaceId,
        folderFilter: state.folderFilter,
        tagFilter: state.tagFilter,
        view: state.view,
        activePersonaId: state.activePersonaId,
        pendingWorkspaceId: state.pendingWorkspaceId,
        pendingSystemPrompt: state.pendingSystemPrompt,
      })
    )
  } catch {
    // 存储不可用时仅在内存中生效
  }
})

export const getWorkspace = (id: string | null | undefined): Workspace | null =>
  id ? (useLibrary.getState().workspaces.find((item) => item.id === id) ?? null) : null

export const getPersona = (id: string | null | undefined): Persona | null =>
  id ? (useLibrary.getState().personas.find((item) => item.id === id) ?? null) : null

export const getFolder = (id: string | null | undefined): Folder | null =>
  id ? (useLibrary.getState().folders.find((item) => item.id === id) ?? null) : null

/** 文件夹的完整层级路径，例如「工作 / 需求评审」。 */
export const folderPath = (id: string | null | undefined): string => {
  if (!id) {
    return ''
  }
  const state = useLibrary.getState()
  const parts: string[] = []
  let current = state.folders.find((folder) => folder.id === id)
  let guard = 0
  while (current && guard < 12) {
    parts.unshift(current.name)
    current = current.parentId
      ? state.folders.find((folder) => folder.id === current?.parentId)
      : undefined
    guard += 1
  }
  return parts.join(' / ')
}

/** 包含自身与全部子文件夹的 id 集合，用于父级筛选。 */
export const folderDescendants = (id: string): Set<string> => {
  const state = useLibrary.getState()
  const result = new Set<string>([id])
  const visit = (parentId: string) => {
    for (const folder of state.folders) {
      if (folder.parentId === parentId && !result.has(folder.id)) {
        result.add(folder.id)
        visit(folder.id)
      }
    }
  }
  visit(id)
  return result
}

/** 文件夹选择器选项：按层级缩进。 */
export const folderOptions = (excludeId?: string): { value: string; label: string }[] => {
  const state = useLibrary.getState()
  const excluded = new Set<string>()
  if (excludeId) {
    const add = (id: string) => {
      excluded.add(id)
      for (const folder of state.folders) {
        if (folder.parentId === id) {
          add(folder.id)
        }
      }
    }
    add(excludeId)
  }
  const all = state.folders.filter((folder) => !excluded.has(folder.id))
  return all
    .map((folder) => {
      const depth = folderPath(folder.id).split(' / ').length - 1
      return { value: folder.id, label: `${'　'.repeat(depth)}${folder.name}` }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
}

export const setActiveWorkspace = (activeWorkspaceId: string | null) => {
  const workspace = getWorkspace(activeWorkspaceId)
  useLibrary.setState({
    activeWorkspaceId,
    pendingWorkspaceId: activeWorkspaceId,
    folderFilter: null,
    tagFilter: null,
    view: 'active',
  })
  if (workspace?.model) {
    // 新建会话的模型选择位跟随工作区
    setSessionModel(null, workspace.model)
  }
}

export const setLibraryView = (view: SessionView) => useLibrary.setState({ view })
export const setFolderFilter = (folderFilter: string | null) =>
  useLibrary.setState({ folderFilter })
export const setTagFilter = (tagFilter: string | null) => useLibrary.setState({ tagFilter })
export const setActivePersona = (activePersonaId: string | null) =>
  useLibrary.setState({ activePersonaId })

/* ---------------- 工作区 ---------------- */

export const saveWorkspace = (item: Omit<Workspace, 'id' | 'createdAt'> & { id?: string }) => {
  const id = item.id ?? createId()
  useLibrary.setState((state) => {
    const existing = state.workspaces.find((workspace) => workspace.id === id)
    const next: Workspace = {
      id,
      name: item.name.trim() || '未命名工作区',
      color: item.color,
      systemPrompt: item.systemPrompt,
      model: item.model,
      personaId: item.personaId,
      createdAt: existing?.createdAt ?? now(),
    }
    return {
      workspaces: existing
        ? state.workspaces.map((workspace) => (workspace.id === id ? next : workspace))
        : [...state.workspaces, next],
    }
  })
  return id
}

export const removeWorkspace = (id: string) => {
  useLibrary.setState((state) => ({
    workspaces: state.workspaces.filter((item) => item.id !== id),
    activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
    pendingWorkspaceId: state.pendingWorkspaceId === id ? null : state.pendingWorkspaceId,
  }))
}

/* ---------------- 文件夹 ---------------- */

export const saveFolder = (name: string, id?: string, parentId?: string | null) => {
  const folderId = id ?? createId()
  useLibrary.setState((state) => {
    const existing = state.folders.find((folder) => folder.id === folderId)
    const next: Folder = {
      id: folderId,
      name: name.trim() || '未命名文件夹',
      parentId: parentId ?? existing?.parentId ?? null,
      createdAt: existing?.createdAt ?? now(),
    }
    return {
      folders: existing
        ? state.folders.map((folder) => (folder.id === folderId ? next : folder))
        : [...state.folders, next],
    }
  })
  return folderId
}

export const removeFolder = (id: string) => {
  useLibrary.setState((state) => ({
    folders: state.folders.filter((item) => item.id !== id),
    folderFilter: state.folderFilter === id ? null : state.folderFilter,
  }))
}

/* ---------------- 提示词 / 片段 ---------------- */

export const savePersona = (item: Omit<Persona, 'id' | 'createdAt'> & { id?: string }) => {
  const id = item.id ?? createId()
  useLibrary.setState((state) => {
    const existing = state.personas.find((persona) => persona.id === id)
    const next: Persona = {
      id,
      name: item.name.trim() || '未命名提示词',
      prompt: item.prompt,
      createdAt: existing?.createdAt ?? now(),
    }
    return {
      personas: existing
        ? state.personas.map((persona) => (persona.id === id ? next : persona))
        : [...state.personas, next],
    }
  })
  return id
}

export const removePersona = (id: string) => {
  useLibrary.setState((state) => ({
    personas: state.personas.filter((item) => item.id !== id),
    activePersonaId: state.activePersonaId === id ? null : state.activePersonaId,
  }))
}

export const saveSnippet = (item: Omit<Snippet, 'id' | 'createdAt'> & { id?: string }) => {
  const id = item.id ?? createId()
  useLibrary.setState((state) => {
    const existing = state.snippets.find((snippet) => snippet.id === id)
    const next: Snippet = {
      id,
      name: item.name.trim() || '未命名片段',
      text: item.text,
      createdAt: existing?.createdAt ?? now(),
    }
    return {
      snippets: existing
        ? state.snippets.map((snippet) => (snippet.id === id ? next : snippet))
        : [...state.snippets, next],
    }
  })
  return id
}

export const removeSnippet = (id: string) => {
  useLibrary.setState((state) => ({ snippets: state.snippets.filter((item) => item.id !== id) }))
}

/* ---------------- 会话模板 ---------------- */

export const saveTemplate = (
  item: Omit<SessionTemplate, 'id' | 'createdAt'> & { id?: string }
) => {
  const id = item.id ?? createId()
  useLibrary.setState((state) => {
    const existing = state.templates.find((template) => template.id === id)
    const next: SessionTemplate = {
      ...item,
      id,
      name: item.name.trim() || '未命名模板',
      createdAt: existing?.createdAt ?? now(),
    }
    return {
      templates: existing
        ? state.templates.map((template) => (template.id === id ? next : template))
        : [...state.templates, next],
    }
  })
  return id
}

export const removeTemplate = (id: string) => {
  useLibrary.setState((state) => ({ templates: state.templates.filter((item) => item.id !== id) }))
}

/* ---------------- 搜索历史 ---------------- */

const HISTORY_LIMIT = 30

export const recordSearch = (query: string) => {
  const text = query.trim()
  if (!text) {
    return
  }
  useLibrary.setState((state) => {
    const pinned = state.searchHistory.find((item) => item.query === text && item.pinned)
    if (pinned) {
      return state
    }
    const next = [
      { query: text, at: now(), pinned: false },
      ...state.searchHistory.filter((item) => item.query !== text),
    ].slice(0, HISTORY_LIMIT)
    return { searchHistory: next }
  })
}

export const togglePinnedSearch = (query: string) => {
  useLibrary.setState((state) => {
    const existing = state.searchHistory.find((item) => item.query === query)
    if (!existing) {
      return {
        searchHistory: [{ query, at: now(), pinned: true }, ...state.searchHistory].slice(
          0,
          HISTORY_LIMIT
        ),
      }
    }
    return {
      searchHistory: state.searchHistory.map((item) =>
        item.query === query ? { ...item, pinned: !item.pinned } : item
      ),
    }
  })
}

export const clearSearchHistory = () => useLibrary.setState({ searchHistory: [] })

/* ---------------- 斜杠快捷指令 ---------------- */

export type SlashCommand = {
  id: string
  label: string
  hint: string
  insert: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'translate',
    label: '/翻译',
    hint: '将选中或随后内容翻译为指定语言',
    insert: '请把下面的内容翻译成{{语言}}，保持原意与格式：\n\n',
  },
  {
    id: 'summarize',
    label: '/总结',
    hint: '提炼要点与结论',
    insert: '请总结下面的内容，先给一句话结论，再列 3-5 个要点：\n\n',
  },
  {
    id: 'polish',
    label: '/润色',
    hint: '让表达更清晰自然',
    insert: '请润色下面的文字，保持原意，语气自然，直接输出修改后的版本：\n\n',
  },
  {
    id: 'code',
    label: '/代码',
    hint: '解释或审查一段代码',
    insert: '请解释下面代码的作用，并指出潜在问题与改进方式：\n\n```\n\n```',
  },
  {
    id: 'plan',
    label: '/方案',
    hint: '给出可执行的分步方案',
    insert: '请为{{主题}}设计一份可执行方案，包含目标、步骤、风险与验收标准：\n',
  },
  {
    id: 'compare',
    label: '/对比',
    hint: '从多个维度比较两个事物',
    insert: '请从适用场景、成本、优缺点等维度对比{{方案A}}与{{方案B}}，最后给出建议：\n',
  },
]
