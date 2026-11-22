import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import { applyFontScale, registerApiKeyPersister, useSettings } from './services/settings.js'
import { installLogCollectors } from './services/logs.js'
import { initKeys } from './services/keys.js'
import { secureGet, secureRemove, secureSet } from './services/secureStore.js'
import { ErrorBoundary } from './components/features/ErrorBoundary.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()
applyFontScale()
installLogCollectors()

/** API Key 改为加密存储：优先读取密文，首次升级时把旧明文迁走。 */
const LEGACY_API_KEY = 'chat-demo:api-key'

registerApiKeyPersister((apiKey) => {
  void (async () => {
    try {
      if (apiKey) {
        await secureSet('api-key', apiKey)
        localStorage.removeItem(LEGACY_API_KEY)
      } else {
        secureRemove('api-key')
        localStorage.removeItem(LEGACY_API_KEY)
      }
    } catch {
      // 加密不可用时退回明文，保证仍能使用
      try {
        if (apiKey) {
          localStorage.setItem(LEGACY_API_KEY, apiKey)
        } else {
          localStorage.removeItem(LEGACY_API_KEY)
        }
      } catch {
        // 忽略
      }
    }
  })()
})

const hydrateApiKey = async () => {
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(LEGACY_API_KEY)
  } catch {
    legacy = null
  }
  if (legacy) {
    useSettings.setState({ apiKey: legacy })
    try {
      await secureSet('api-key', legacy)
      localStorage.removeItem(LEGACY_API_KEY)
    } catch {
      // 保留明文继续可用
    }
    return
  }
  try {
    const saved = await secureGet('api-key')
    if (saved) {
      useSettings.setState({ apiKey: saved })
    }
  } catch {
    // 密文无法解密时按未配置处理
  }
}

const boot = async () => {
  // 存储被其他标签页占用时 IndexedDB 可能长时间不返回，最多等 1.5 秒，避免白屏
  const settle = (task: Promise<unknown>) =>
    Promise.race([
      task.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  await settle(hydrateApiKey())
  await settle(initKeys())
  createRoot(document.getElementById('root') as HTMLElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

void boot()

// PWA：仅 http(s) 下注册；file:// 直接双击打开时跳过
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {
      // 离线缓存不可用不影响在线使用
    })
  })
}
