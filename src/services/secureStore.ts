/**
 * 本机敏感配置加密：AES-GCM + 不可导出的设备密钥。
 * 密钥保存在 IndexedDB，密文写 localStorage；服务端或其他页面脚本无法直接读到明文。
 * 注意：这是静态前端的本地加固，不等同于操作系统级密钥链。
 */

const DB_NAME = 'chat-demo-secure'
const STORE = 'vault'
const KEY_ID = '__aes-key__'

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = () =>
  (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    dbPromise = null
    throw error
  }))

const idbGet = async (key: string): Promise<unknown> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const idbPut = async (key: string, value: unknown): Promise<void> => {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const getCryptoKey = async (): Promise<CryptoKey> => {
  const saved = await idbGet(KEY_ID)
  if (saved instanceof CryptoKey) {
    return saved
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await idbPut(KEY_ID, key)
  return key
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const fromBase64 = (text: string) => {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const encryptText = async (text: string): Promise<string> => {
  const key = await getCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  )
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`
}

export const decryptText = async (payload: string): Promise<string> => {
  const [version, ivText, cipherText] = payload.split('.')
  if (version !== 'v1' || !ivText || !cipherText) {
    throw new Error('Unsupported encrypted payload')
  }
  const key = await getCryptoKey()
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivText) },
    key,
    fromBase64(cipherText)
  )
  return new TextDecoder().decode(plain)
}

/** 值统一以 v1.iv.cipher 的形式写入 localStorage。 */
export const secureGet = async (name: string): Promise<string | null> => {
  const payload = localStorage.getItem(`chat-demo:secure:${name}`)
  if (!payload) {
    return null
  }
  return decryptText(payload)
}

export const secureSet = async (name: string, value: string): Promise<void> => {
  localStorage.setItem(`chat-demo:secure:${name}`, await encryptText(value))
}

export const secureRemove = (name: string) => {
  localStorage.removeItem(`chat-demo:secure:${name}`)
}

export const secureAvailable = () =>
  typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && 'subtle' in crypto
