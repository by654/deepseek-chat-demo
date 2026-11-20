/**
 * 跨平台生产构建入口。
 *
 * 原上游脚本为 `rm -rf dist && NODE_ENV=production rspack build`，
 * 仅适用于 POSIX shell；这里改用 Node 脚本清理目录并注入 NODE_ENV，
 * 保证 Windows / macOS / Linux 下 `pnpm build` 行为一致。
 * 构建配置中的 output.clean 与 CopyRspackPlugin 仍然负责产物目录清理
 * 与 LICENSE 复制，逻辑不变。
 */
import { readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

// Windows 上若 dist 被静态服务等进程占用（目录被当作工作目录），整目录删除会 EBUSY。
// 此时退化为「清空目录内容、保留目录本身」，最终清理仍由 rspack 的 output.clean 兜底。
try {
  rmSync(dist, { recursive: true, force: true })
} catch (error) {
  let entries = []
  try {
    entries = readdirSync(dist)
  } catch {
    entries = []
  }
  for (const entry of entries) {
    try {
      rmSync(path.join(dist, entry), { recursive: true, force: true })
    } catch {
      // 单个文件被占用时留给 rspack 覆盖写入
    }
  }
  console.warn(`[build] dist 目录被占用，已退化为就地清理：${error.code ?? error.message}`)
}

const env = { ...process.env, NODE_ENV: 'production' }
const result = spawnSync('rspack', ['build', '-c', 'rspack.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env,
})

if (result.error) {
  console.error('[build] 启动 rspack 失败：', result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
