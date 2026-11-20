import { formatDate } from '../../utils/format.js'
import * as db from './db.js'
import type { StoredFile } from './db.js'
import { parseSessionPath } from './history/paths.js'
import { replaceHistory, useChatStore } from './store.js'
import type { Session } from './types.js'

export { BackupError } from './history/errors.js'

// 导入、导出与全部删除串行处理，避免读取归档时数据被清空或两个替换事务交错。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(run)
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepseek_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入。 */
export const exportHistory = (): Promise<{ name: string; blob: Blob }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        const session = Object.hasOwn(sessionCache, summary.id)
          ? sessionCache[summary.id]
          : await db.loadSession(summary.id)
        if (!session) {
          throw new Error(`History session disappeared during export: ${summary.id}`)
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        yield { ...session, ...summary }
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const blob = await exportArchive(readSessions())
    return { name: backupFileName(now), blob }
  })

/** 导入前的本地快照：会话详情 + 其引用的附件原件，供合并模式写回。 */
type HistorySnapshot = { session: Session; files: StoredFile[] }

const snapshotHistory = async (): Promise<HistorySnapshot[]> => {
  const summaries = await db.loadSessionSummaries()
  const snapshot: HistorySnapshot[] = []
  for (const summary of summaries) {
    const session = await db.loadSession(summary.id)
    if (!session) {
      continue
    }
    const ids = new Set<string>()
    for (const message of session.messages) {
      if (message.role !== 'assistant') {
        for (const file of message.files) {
          ids.add(file.id)
        }
      }
    }
    const files: StoredFile[] = []
    for (const id of ids) {
      const blob = await db.loadFile(id)
      if (blob) {
        files.push({ id, blob })
      }
    }
    snapshot.push({ session, files })
  }
  return snapshot
}

/** 扫描归档里包含的会话 ID，用于判断合并时的冲突。不消费正文，逐条跳过。 */
const archiveSessionIds = async (file: File): Promise<Set<string>> => {
  const { readArchive, skipEntry } = await import('./history/zipReader.js')
  const ids = new Set<string>()
  for await (const entry of readArchive(file)) {
    const id = parseSessionPath(entry.path)
    if (id !== null) {
      ids.add(id)
    }
    await skipEntry(entry)
  }
  return ids
}

/**
 * 合并模式：把导入前的本地会话写入暂存区，与归档内容一起提交。
 * 冲突（同一会话 ID）按保留本地 / 保留导入 / 两者都留处理。
 */
const mergeIntoStaging = async (
  snapshot: HistorySnapshot[],
  imported: ReadonlySet<string>,
  resolution: ConflictResolution,
): Promise<void> => {
  const stamp = Date.now().toString(36)
  for (const { session, files } of snapshot) {
    let target = session
    if (imported.has(session.id)) {
      if (resolution === 'keepImported') {
        continue
      }
      if (resolution === 'keepBoth') {
        target = {
          ...session,
          id: `${session.id}-local-${stamp}`,
          title: `${session.title}（本地）`,
        }
      }
    }
    if (files.length > 0) {
      await db.saveStagingFiles(files)
    }
    if (imported.has(session.id)) {
      await db.putStagingSession(target)
    } else {
      await db.addStagingSession(target)
    }
  }
}

/** 导入模式：整体替换本地历史，或与本地历史合并。 */
export type ImportMode = 'replace' | 'merge'

/** 合并模式下同一会话 ID 冲突时的取舍：保留本地 / 保留导入 / 两条都保留。 */
export type ConflictResolution = 'keepLocal' | 'keepImported' | 'keepBoth'

export type ImportOptions = { mode?: ImportMode; resolution?: ConflictResolution }

/**
 * 确认后调用：先检查 ZIP 格式与版本，校验失败时保留正在生成的回答；
 * 通过后从 ZIP 流式写入暂存，成功才替换原有会话与图片原件。返回导入后的会话数。
 */
export const importHistory = (file: File, options: ImportOptions = {}): Promise<number> =>
  enqueueBackup(async () => {
    const { checkArchiveFormat, importArchive } = await import('./history/importArchive.js')
    await checkArchiveFormat(file)
    if ((options.mode ?? 'replace') === 'replace') {
      return replaceHistory(() => importArchive(file))
    }
    // 合并前先取快照与冲突清单：导入会替换本地历史，之后再读就取不到了。
    const snapshot = await snapshotHistory()
    const imported = await archiveSessionIds(file)
    return replaceHistory(async () => {
      await importArchive(file)
      await mergeIntoStaging(snapshot, imported, options.resolution ?? 'keepBoth')
    })
  })

/** 确认删除后调用：以空历史原子替换全部本地会话与附件，保留 API Key 和其他设置。 */
export const clearHistory = (): Promise<void> =>
  enqueueBackup(async () => {
    await replaceHistory(async () => {})
  })
