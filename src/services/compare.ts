import { streamMessage } from './api/client.js'
import type { ChatModel } from './api/types.js'
import { useSettings } from './settings.js'
import { activeKey } from './keys.js'
import { getPersona, getWorkspace, useLibrary } from './library.js'

/** 双模型并排对比：同一问题分别请求 Flash 与 Pro，互不影响。 */

export type CompareSide = {
  model: ChatModel
  text: string
  status: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  error?: string
  startedAt: number
  endedAt?: number
}

export type CompareUpdate = (side: CompareSide) => void

export const COMPARE_MODELS: ChatModel[] = ['deepseek-flash', 'deepseek-v4-pro']

const systemFor = () => {
  const settings = useSettings.getState()
  const library = useLibrary.getState()
  const workspace = getWorkspace(library.activeWorkspaceId)
  const persona = getPersona(library.activePersonaId)
  return [
    '该助手为DeepSeek，由深度求索公司创造。',
    workspace?.systemPrompt.trim() ?? '',
    persona?.prompt.trim() ?? '',
    settings.systemPrompt.trim(),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const runCompare = async (
  prompt: string,
  signal: AbortSignal,
  onUpdate: CompareUpdate
) => {
  const settings = useSettings.getState()
  const apiKey = activeKey()?.key ?? settings.apiKey ?? ''
  const system = systemFor()
  await Promise.all(
    COMPARE_MODELS.map(async (model) => {
      const startedAt = Date.now()
      let text = ''
      const emit = (side: CompareSide) => onUpdate(side)
      try {
        emit({ model, text, status: 'running', startedAt })
        const events = streamMessage(
          apiKey,
          {
            model,
            system,
            messages: [{ role: 'user', content: prompt }],
            thinking: { type: model === 'deepseek-v4-pro' ? 'enabled' : 'disabled' },
            tools: [],
            safety_check: { level: 'high' },
          },
          signal
        )
        for await (const event of events) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            text += event.delta.text
            emit({ model, text, status: 'running', startedAt })
          }
        }
        emit({ model, text, status: 'done', startedAt, endedAt: Date.now() })
      } catch (error) {
        if (signal.aborted) {
          emit({ model, text, status: 'stopped', startedAt, endedAt: Date.now() })
        } else {
          emit({
            model,
            text,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            startedAt,
            endedAt: Date.now(),
          })
        }
      }
    })
  )
}
