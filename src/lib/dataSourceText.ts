import type { DataSource } from '@/types/device'

/** 三态数据源文案集中定义，UI 只引用这里的 key，不再各自拼三元表达式。 */
export const DATA_SOURCE_SHORT: Record<DataSource, string> = {
  tauri: 'TAURI',
  snapshot: 'SCAN',
  demo: 'DEMO',
}

export const DATA_SOURCE_LABEL_KEY: Record<DataSource, string> = {
  tauri: 'source.tauri',
  snapshot: 'source.snapshot',
  demo: 'source.demo',
}

export const DATA_SOURCE_DETAIL_KEY: Record<DataSource, string> = {
  tauri: 'source.tauriDetail',
  snapshot: 'source.snapshotDetail',
  demo: 'source.demoDetail',
}

export const DATA_SOURCE_SAMPLING: Record<DataSource, string> = {
  tauri: 'HIDAPI · 10 Hz → 1 Hz',
  snapshot: 'LOCAL SNAPSHOT',
  demo: 'SIMULATED · 1 Hz',
}

export const DATA_SOURCE_STORAGE: Record<DataSource, string> = {
  tauri: 'SQLite · 1 Hz downsample',
  snapshot: 'JSON snapshot · read-only',
  demo: 'Browser demo · localStorage',
}

export function isLiveSource(source: DataSource): boolean {
  return source === 'tauri'
}

export function canSimulateHotplug(source: DataSource): boolean {
  return source === 'demo'
}
