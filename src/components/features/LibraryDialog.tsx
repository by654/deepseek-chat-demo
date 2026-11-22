import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  folderOptions,
  folderPath,
  removeFolder,
  removePersona,
  removeSnippet,
  removeTemplate,
  removeWorkspace,
  saveFolder,
  savePersona,
  saveSnippet,
  saveTemplate,
  saveWorkspace,
  setActivePersona,
  setActiveWorkspace,
  setFolderFilter,
  useLibrary,
  type SessionTemplate,
} from '../../services/library.js'
import { newChat, setSessionPersona, useChatStore } from '../../services/chat/store.js'
import { setDraftText, addDraftFiles, getDraft } from '../../services/chat/drafts.js'
import { setSessionModel } from '../../services/chat/model.js'
import { useSettings } from '../../services/settings.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { showToast } from '../base/toastState.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { IconTrashOutline16 } from '../base/icons.js'
import { removeStar, useStars } from '../../services/stars.js'
import { selectSession } from '../../services/chat/store.js'
import { requestJump } from '../../services/chat/jump.js'
import { openCompareDialog } from './commandPaletteState.js'
import { closeLibrary, useLibraryDialog, type LibraryTab } from './libraryState.js'
import styles from './features.module.css'

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'stars', label: '素材库' },
  { id: 'templates', label: '会话模板' },
  { id: 'personas', label: '提示词库' },
  { id: 'snippets', label: '常用片段' },
  { id: 'workspaces', label: '工作区' },
  { id: 'folders', label: '文件夹' },
]

export const LibraryDialog = () => {
  const open = useLibraryDialog((state) => state.open)
  return open ? <LibraryContent /> : null
}

const LibraryContent = () => {
  const t = useTranslate()
  const [tab, setTab] = useState(() => useLibraryDialog.getState().tab)
  return (
    <Modal title="素材库与资料库" closable className={styles.libraryModal} onClose={closeLibrary}>
      <div className={styles.dialogBody}>
        <div className={styles.tabs} role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={clsx(styles.tab, tab === item.id && styles.tabActive)}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === 'stars' ? (
          <StarsPanel />
        ) : tab === 'templates' ? (
          <TemplatesPanel />
        ) : tab === 'personas' ? (
          <PersonasPanel />
        ) : tab === 'snippets' ? (
          <SnippetsPanel />
        ) : tab === 'workspaces' ? (
          <WorkspacesPanel />
        ) : (
          <FoldersPanel />
        )}
        <div className={styles.paletteFoot}>
          <span>{t('appName')}</span>
          <button type="button" className={styles.bannerAction} onClick={() => openCompareDialog('')}>
            双模型对比
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- 素材库 ---------------- */

const StarsPanel = () => {
  const items = useStars((state) => state.items)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return items.filter(
      (item) =>
        !text ||
        item.content.toLowerCase().includes(text) ||
        item.sessionTitle.toLowerCase().includes(text) ||
        item.tags.some((tag) => tag.toLowerCase().includes(text))
    )
  }, [items, query])

  const insert = (text: string) => {
    const activeId = useChatStore.getState().activeId
    const current = getDraft(activeId).text
    setDraftText(activeId, current ? `${current}\n\n${text}` : text)
    showToast({ key: 'snippetInserted' })
    closeLibrary()
  }

  return (
    <>
      <input
        className={styles.input}
        placeholder="搜索素材内容、会话标题或标签…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>还没有星标素材。在回答下方点击星标即可收藏。</div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardTitle}>
                  {item.sessionTitle}
                  <span className={styles.badge}>{item.model ?? '回答'}</span>
                </div>
                <div className={styles.cardText}>{item.content}</div>
                <div className={styles.resultMeta}>
                  {new Date(item.createdAt).toLocaleString('zh-CN')}
                  {item.tags.length > 0 ? ` · ${item.tags.join(' / ')}` : ''}
                </div>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.chip} onClick={() => insert(item.content)}>
                  插入
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => {
                    selectSession(item.sessionId)
                    requestJump(item.sessionId, item.messageId, '')
                    closeLibrary()
                  }}
                >
                  定位
                </button>
                <IconButton
                  icon={<IconTrashOutline16 />}
                  tooltip="删除素材"
                  onClick={() => void removeStar(item.id)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}

/* ---------------- 模板 ---------------- */

type TemplateForm = {
  id?: string
  name: string
  description: string
  prompt: string
  model: 'deepseek-flash' | 'deepseek-v4-pro'
  systemPrompt: string
  personaId: string
  workspaceId: string
  attachment: string
}

const emptyTemplate = (): TemplateForm => ({
  name: '',
  description: '',
  prompt: '',
  model: 'deepseek-flash',
  systemPrompt: '',
  personaId: '',
  workspaceId: '',
  attachment: '',
})

const applyTemplate = (template: SessionTemplate) => {
  if (!ensureApiKey()) {
    return
  }
  setSessionModel(null, template.model ?? 'deepseek-flash')
  setActivePersona(template.personaId)
  if (template.workspaceId) {
    setActiveWorkspace(template.workspaceId)
  }
  setDraftText(null, template.prompt)
  useLibrary.setState({ pendingSystemPrompt: template.systemPrompt.trim() || null })
  if (template.attachments.length > 0) {
    const files = template.attachments.map(
      (item) => new File([item.text], item.name, { type: 'text/plain' })
    )
    addDraftFiles(null, files, useSettings.getState().apiKey ?? '')
  }
  newChat()
  closeLibrary()
  showToast({ key: 'templateApplied' })
}

const TemplatesPanel = () => {
  const templates = useLibrary((state) => state.templates)
  const personas = useLibrary((state) => state.personas)
  const workspaces = useLibrary((state) => state.workspaces)
  const [form, setForm] = useState<TemplateForm | null>(null)

  const submit = () => {
    if (!form || !form.name.trim()) {
      return
    }
    const attachment = form.attachment.trim()
    saveTemplate({
      id: form.id,
      name: form.name,
      description: form.description,
      prompt: form.prompt,
      model: form.model,
      systemPrompt: form.systemPrompt,
      personaId: form.personaId || null,
      workspaceId: form.workspaceId || null,
      attachments: attachment
        ? [{ name: `${form.name.trim()}.txt`, text: attachment }]
        : [],
    })
    setForm(null)
  }

  return (
    <>
      <div className={styles.list}>
        {templates.length === 0 && !form ? (
          <div className={styles.empty}>把常用的模型、提示词与开场内容存成模板，一键起新会话。</div>
        ) : null}
        {templates.map((template) => (
          <div key={template.id} className={styles.card}>
            <div className={styles.cardMain}>
              <div className={styles.cardTitle}>
                {template.name}
                <span className={styles.badge}>{template.model ?? '默认模型'}</span>
              </div>
              <div className={styles.cardText}>
                {template.description || template.prompt || '（无开场内容）'}
              </div>
            </div>
            <div className={styles.cardActions}>
              <button type="button" className={styles.chip} onClick={() => applyTemplate(template)}>
                使用
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() =>
                  setForm({
                    id: template.id,
                    name: template.name,
                    description: template.description,
                    prompt: template.prompt,
                    model: template.model ?? 'deepseek-flash',
                    systemPrompt: template.systemPrompt,
                    personaId: template.personaId ?? '',
                    workspaceId: template.workspaceId ?? '',
                    attachment: '',
                  })
                }
              >
                编辑
              </button>
              <IconButton
                icon={<IconTrashOutline16 />}
                tooltip="删除模板"
                onClick={() => removeTemplate(template.id)}
              />
            </div>
          </div>
        ))}
        {form ? (
          <div className={styles.formGrid}>
            <div className={styles.inlineFields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>模板名称</span>
                <input
                  className={styles.input}
                  value={form.name}
                  autoFocus
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>模型</span>
                <select
                  className={styles.selectNative}
                  value={form.model}
                  onChange={(event) =>
                    setForm({ ...form, model: event.target.value as TemplateForm['model'] })
                  }
                >
                  <option value="deepseek-flash">deepseek-flash</option>
                  <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>说明</span>
              <input
                className={styles.input}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>开场提问（可含 {'{{变量}}'}）</span>
              <textarea
                className={styles.textarea}
                value={form.prompt}
                onChange={(event) => setForm({ ...form, prompt: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>附加系统提示词</span>
              <textarea
                className={styles.textarea}
                value={form.systemPrompt}
                onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
              />
            </label>
            <div className={styles.inlineFields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>提示词库</span>
                <select
                  className={styles.selectNative}
                  value={form.personaId}
                  onChange={(event) => setForm({ ...form, personaId: event.target.value })}
                >
                  <option value="">不指定</option>
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>工作区</span>
                <select
                  className={styles.selectNative}
                  value={form.workspaceId}
                  onChange={(event) => setForm({ ...form, workspaceId: event.target.value })}
                >
                  <option value="">不指定</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>开场附件（纯文本，可留空）</span>
              <textarea
                className={styles.textarea}
                value={form.attachment}
                onChange={(event) => setForm({ ...form, attachment: event.target.value })}
              />
            </label>
            <div className={styles.formActions}>
              <Button size="s" variant="outlined" onClick={() => setForm(null)}>
                取消
              </Button>
              <Button size="s" onClick={submit}>
                保存模板
              </Button>
            </div>
          </div>
        ) : (
          <Button size="s" variant="outlined" onClick={() => setForm(emptyTemplate())}>
            新建模板
          </Button>
        )}
      </div>
    </>
  )
}

/* ---------------- 提示词 ---------------- */

const PersonasPanel = () => {
  const personas = useLibrary((state) => state.personas)
  const activePersonaId = useLibrary((state) => state.activePersonaId)
  const activeId = useChatStore((state) => state.activeId)
  const [form, setForm] = useState<{ id?: string; name: string; prompt: string } | null>(null)

  return (
    <div className={styles.list}>
      {personas.map((persona) => (
        <div key={persona.id} className={styles.card}>
          <div className={styles.cardMain}>
            <div className={styles.cardTitle}>
              {persona.name}
              {activePersonaId === persona.id ? <span className={styles.badge}>新会话默认</span> : null}
            </div>
            <div className={styles.cardText}>{persona.prompt}</div>
          </div>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => {
                setActivePersona(persona.id)
                if (activeId) {
                  setSessionPersona(activeId, persona.id)
                }
                showToast({ key: 'personaApplied' })
              }}
            >
              {activeId ? '应用到本会话' : '设为默认'}
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => setForm({ id: persona.id, name: persona.name, prompt: persona.prompt })}
            >
              编辑
            </button>
            <IconButton
              icon={<IconTrashOutline16 />}
              tooltip="删除提示词"
              onClick={() => removePersona(persona.id)}
            />
          </div>
        </div>
      ))}
      {form ? (
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>名称</span>
            <input
              className={styles.input}
              value={form.name}
              autoFocus
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>系统提示词</span>
            <textarea
              className={styles.textarea}
              value={form.prompt}
              onChange={(event) => setForm({ ...form, prompt: event.target.value })}
            />
          </label>
          <div className={styles.formActions}>
            <Button size="s" variant="outlined" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button
              size="s"
              onClick={() => {
                if (form.name.trim()) {
                  savePersona(form)
                  setForm(null)
                }
              }}
            >
              保存
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="s"
          variant="outlined"
          onClick={() => setForm({ name: '', prompt: '' })}
        >
          新建提示词
        </Button>
      )}
    </div>
  )
}

/* ---------------- 片段 ---------------- */

const SnippetsPanel = () => {
  const snippets = useLibrary((state) => state.snippets)
  const [form, setForm] = useState<{ id?: string; name: string; text: string } | null>(null)

  const insert = (text: string) => {
    const activeId = useChatStore.getState().activeId
    const current = getDraft(activeId).text
    setDraftText(activeId, current ? `${current}\n${text}` : text)
    showToast({ key: 'snippetInserted' })
    closeLibrary()
  }

  return (
    <div className={styles.list}>
      {snippets.map((snippet) => (
        <div key={snippet.id} className={styles.card}>
          <div className={styles.cardMain}>
            <div className={styles.cardTitle}>{snippet.name}</div>
            <div className={styles.cardText}>{snippet.text}</div>
          </div>
          <div className={styles.cardActions}>
            <button type="button" className={styles.chip} onClick={() => insert(snippet.text)}>
              插入
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => setForm({ id: snippet.id, name: snippet.name, text: snippet.text })}
            >
              编辑
            </button>
            <IconButton
              icon={<IconTrashOutline16 />}
              tooltip="删除片段"
              onClick={() => removeSnippet(snippet.id)}
            />
          </div>
        </div>
      ))}
      {form ? (
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>名称</span>
            <input
              className={styles.input}
              value={form.name}
              autoFocus
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>内容</span>
            <textarea
              className={styles.textarea}
              value={form.text}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
            />
          </label>
          <div className={styles.formActions}>
            <Button size="s" variant="outlined" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button
              size="s"
              onClick={() => {
                if (form.name.trim()) {
                  saveSnippet(form)
                  setForm(null)
                }
              }}
            >
              保存
            </Button>
          </div>
        </div>
      ) : (
        <Button size="s" variant="outlined" onClick={() => setForm({ name: '', text: '' })}>
          新建片段
        </Button>
      )}
    </div>
  )
}

/* ---------------- 工作区 ---------------- */

const WorkspacesPanel = () => {
  const workspaces = useLibrary((state) => state.workspaces)
  const activeWorkspaceId = useLibrary((state) => state.activeWorkspaceId)
  const personas = useLibrary((state) => state.personas)
  const [form, setForm] = useState<{
    id?: string
    name: string
    color: string
    model: 'deepseek-flash' | 'deepseek-v4-pro' | ''
    personaId: string
    systemPrompt: string
  } | null>(null)

  return (
    <div className={styles.list}>
      {workspaces.map((workspace) => (
        <div key={workspace.id} className={styles.card}>
          <div className={styles.cardMain}>
            <div className={styles.cardTitle}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: workspace.color,
                }}
              />
              {workspace.name}
              {activeWorkspaceId === workspace.id ? (
                <span className={styles.badge}>当前</span>
              ) : null}
            </div>
            <div className={styles.cardText}>
              {workspace.systemPrompt || '（未设置专属提示词）'}
              {workspace.model ? ` · 默认模型 ${workspace.model}` : ''}
            </div>
          </div>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => {
                setActiveWorkspace(workspace.id)
                showToast({ key: 'workspaceApplied' })
              }}
            >
              切换
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() =>
                setForm({
                  id: workspace.id,
                  name: workspace.name,
                  color: workspace.color,
                  model: workspace.model ?? '',
                  personaId: workspace.personaId ?? '',
                  systemPrompt: workspace.systemPrompt,
                })
              }
            >
              编辑
            </button>
            <IconButton
              icon={<IconTrashOutline16 />}
              tooltip="删除工作区"
              onClick={() => removeWorkspace(workspace.id)}
            />
          </div>
        </div>
      ))}
      {form ? (
        <div className={styles.formGrid}>
          <div className={styles.inlineFields}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>名称</span>
              <input
                className={styles.input}
                value={form.name}
                autoFocus
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>标识色</span>
              <input
                className={styles.input}
                type="color"
                value={form.color}
                onChange={(event) => setForm({ ...form, color: event.target.value })}
              />
            </label>
          </div>
          <div className={styles.inlineFields}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>默认模型</span>
              <select
                className={styles.selectNative}
                value={form.model}
                onChange={(event) =>
                  setForm({ ...form, model: event.target.value as typeof form.model })
                }
              >
                <option value="">跟随全局</option>
                <option value="deepseek-flash">deepseek-flash</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>绑定提示词</span>
              <select
                className={styles.selectNative}
                value={form.personaId}
                onChange={(event) => setForm({ ...form, personaId: event.target.value })}
              >
                <option value="">不指定</option>
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>工作区专属提示词</span>
            <textarea
              className={styles.textarea}
              value={form.systemPrompt}
              onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
            />
          </label>
          <div className={styles.formActions}>
            <Button size="s" variant="outlined" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button
              size="s"
              onClick={() => {
                if (form.name.trim()) {
                  saveWorkspace({
                    id: form.id,
                    name: form.name,
                    color: form.color,
                    model: form.model || null,
                    personaId: form.personaId || null,
                    systemPrompt: form.systemPrompt,
                  })
                  setForm(null)
                }
              }}
            >
              保存
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="s"
          variant="outlined"
          onClick={() =>
            setForm({
              name: '',
              color: '#4d6bfe',
              model: '',
              personaId: '',
              systemPrompt: '',
            })
          }
        >
          新建工作区
        </Button>
      )}
    </div>
  )
}

/* ---------------- 文件夹 ---------------- */

const FoldersPanel = () => {
  const folders = useLibrary((state) => state.folders)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const options = folderOptions(editing ?? undefined)

  const save = () => {
    if (!name.trim()) {
      return
    }
    saveFolder(name, editing ?? undefined, parentId || null)
    setName('')
    setParentId('')
    setEditing(null)
  }

  return (
    <div className={styles.list}>
      {folders.map((folder) => (
        <div key={folder.id} className={styles.card}>
          <div className={styles.cardMain}>
            <div className={styles.cardTitle}>{folderPath(folder.id)}</div>
            <div className={styles.cardText}>
              {folder.parentId ? '子文件夹' : '顶层文件夹'}
            </div>
          </div>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => {
                setFolderFilter(folder.id)
                showToast({ key: 'folderFiltered' })
              }}
            >
              筛选
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => {
                setEditing(folder.id)
                setName(folder.name)
                setParentId(folder.parentId ?? '')
              }}
            >
              重命名
            </button>
            <IconButton
              icon={<IconTrashOutline16 />}
              tooltip="删除文件夹"
              onClick={() => removeFolder(folder.id)}
            />
          </div>
        </div>
      ))}
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{editing ? '重命名文件夹' : '新建文件夹'}</span>
          <input
            className={styles.input}
            value={name}
            placeholder="例如：需求评审、论文资料"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                save()
              }
            }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>上级文件夹</span>
          <select
            className={styles.selectNative}
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">顶层</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.formActions}>
          {editing ? (
            <Button
              size="s"
              variant="outlined"
              onClick={() => {
                setEditing(null)
                setName('')
                setParentId('')
              }}
            >
              取消
            </Button>
          ) : null}
          <Button size="s" onClick={save}>
            {editing ? '保存' : '新建'}
          </Button>
        </div>
      </div>
    </div>
  )
}
