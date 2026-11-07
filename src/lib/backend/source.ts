import type { DataSource } from '@/types/device'

/** 快照元数据：用于 UI 与导出注明「何时、用什么扫的」。 */
export interface SnapshotMeta {
  scannedAt: number
  source: string
  deviceCount: number
}

export interface DataSourceState {
  source: DataSource
  meta: SnapshotMeta | null
  /** 每次整源替换自增，供订阅方区分「换数据源」与「真实热插拔」。 */
  epoch: number
}

type Listener = () => void

const listeners = new Set<Listener>()
let state: DataSourceState = { source: 'demo', meta: null, epoch: 0 }

function sameMeta(a: SnapshotMeta | null, b: SnapshotMeta | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.scannedAt === b.scannedAt && a.source === b.source && a.deviceCount === b.deviceCount
}

/** useSyncExternalStore 的 snapshot 必须返回稳定引用，因此只在真正变化时替换对象。 */
export function getDataSourceState(): DataSourceState {
  return state
}

export function subscribeDataSource(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setDataSource(source: DataSource, meta: SnapshotMeta | null = null): void {
  if (state.source === source && sameMeta(state.meta, meta)) return
  state = { source, meta, epoch: state.epoch + 1 }
  for (const listener of listeners) listener()
}

export function getDataSource(): DataSource {
  return state.source
}

export function getSourceEpoch(): number {
  return state.epoch
}
