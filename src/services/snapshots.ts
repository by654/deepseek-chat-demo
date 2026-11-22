import { createId } from '../utils/id.js'
import { applyRemoteSession } from './chat/store.js'
import * as db from './chat/db.js'
import type { Session } from './chat/types.js'

/** 会话快照：手动打点保存完整消息树，可从任意快照分叉继续。 */
export type SnapshotItem = db.SnapshotRecord

export const listSnapshots = (sessionId: string) => db.loadSnapshots(sessionId)

export const createSnapshot = async (session: Session, label?: string): Promise<SnapshotItem> => {
  const snapshot: SnapshotItem = {
    id: createId(),
    sessionId: session.id,
    sessionTitle: session.title || '未命名对话',
    label: label?.trim() || `快照 ${new Date().toLocaleString('zh-CN')}`,
    createdAt: Date.now(),
    messages: structuredClone(session.messages),
    rootMessageId: session.rootMessageId ?? null,
  }
  await db.saveSnapshot(snapshot)
  return snapshot
}

export const removeSnapshot = (id: string) => db.deleteSnapshot(id)

/** 从快照分叉出新会话，原会话与快照保持不变。 */
export const forkSnapshot = async (snapshot: SnapshotItem): Promise<string> => {
  const now = Date.now()
  const session: Session = {
    id: createId(),
    title: `${snapshot.sessionTitle} · 分支`,
    createdAt: now,
    updatedAt: now,
    messages: structuredClone(snapshot.messages),
    rootMessageId: snapshot.rootMessageId,
  }
  await applyRemoteSession(session)
  return session.id
}
