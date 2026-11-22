/**
 * Supabase 接入配置。anon key 是公开密钥，仅用于前端直连（受 RLS 保护），
 * 更换项目时只需改动这里的三项。
 */
export const SUPABASE_URL = 'https://ythttojeewhebsvstllp.supabase.co'

/**
 * 使用新版 Publishable key（sb_publishable_...）。项目已禁用旧版 JWT anon key，
 * 旧 key 会被网关直接判为 Invalid API key。
 */
export const SUPABASE_ANON_KEY = 'sb_publishable_2gDcRofkXcTaPkFeFYlpJA_oDzHYxF-'

/** 用户名映射成的伪邮箱域名：用户名只允许字母数字下划线中文，保证邮箱合法 */
export const USERNAME_EMAIL_DOMAIN = 'chat-demo.local'

/** 同步会话时的表名与 RPC 名 */
export const CHAT_SESSIONS_TABLE = 'chat_sessions'
export const PUSH_RPC = 'push_chat_sessions'

/** 手动同步时每次 RPC 携带的会话条数 */
export const PUSH_BATCH_SIZE = 5

/** 自动同步的防抖延迟：一次会话操作后等待该时间再推送 */
export const PUSH_DEBOUNCE_MS = 1200
