import { streamMessage } from './api/client.js'
import { useSettings } from './settings.js'
import { activeKey } from './keys.js'

/** 输入框内就地改写：选中文本后调用轻量模型，只返回改写结果。 */

export type RewriteAction = 'polish' | 'shorten' | 'expand' | 'translate' | 'formal'

export const REWRITE_LABELS: Record<RewriteAction, string> = {
  polish: '润色',
  shorten: '缩写',
  expand: '扩写',
  translate: '翻译',
  formal: '正式化',
}

const INSTRUCTIONS: Record<RewriteAction, string> = {
  polish: '润色这段文字，保持原意与信息量，让表达更自然、清晰。',
  shorten: '在保留关键信息的前提下压缩这段文字，去掉冗余表达。',
  expand: '在不虚构事实的前提下适度扩写这段文字，补充必要的解释与过渡。',
  translate: '把这段文字翻译成英文；若原文主要是英文，则翻译成简体中文。保持原有语气与格式。',
  formal: '把这段文字改写为正式、专业的书面表达，保持原意。',
}

export const rewriteText = async (
  text: string,
  action: RewriteAction,
  signal: AbortSignal
): Promise<string> => {
  const settings = useSettings.getState()
  const apiKey = activeKey()?.key ?? settings.apiKey ?? ''
  let output = ''
  const events = streamMessage(
    apiKey,
    {
      model: 'deepseek-flash',
      system:
        '你是文字编辑。只输出改写后的正文，不要解释、不要加引号、不要重复原文。保留原有 Markdown 结构。',
      messages: [
        {
          role: 'user',
          content: `${INSTRUCTIONS[action]}\n\n---\n${text}`,
        },
      ],
      thinking: { type: 'disabled' },
      tools: [],
      safety_check: { level: 'high' },
    },
    signal
  )
  for await (const event of events) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      output += event.delta.text
    }
  }
  return output.trim()
}

/** 不依赖输入框选中内容的“翻译为…”快捷动作。 */
export const translateText = (text: string, language: string, signal: AbortSignal) =>
  rewriteText(`${text}\n\n（请翻译成${language}）`, 'translate', signal)
