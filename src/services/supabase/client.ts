import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js'

/**
 * 全局唯一的 Supabase 客户端。
 * 登录态存进 localStorage（沿用项目 chat-demo: 前缀），刷新后自动恢复并续期 token。
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'chat-demo:supabase-auth',
  },
})
