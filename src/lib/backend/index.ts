import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from '@/lib/storage'
import type {
  DeviceEventLog,
  DeviceSnapshot,
  Diagnosis,
  PeripheralBackend,
  RealSnapshot,
  TopologyGraph,
} from '@/types/device'
import { DemoBackend } from './demo'
import { getDataSource, setDataSource } from './source'
import { TauriBackend } from './tauri'

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}real-devices.json`
const FETCH_TIMEOUT_MS = 8_000

function isTauriHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function createBackend(): PeripheralBackend {
  return isTauriHost() ? new TauriBackend() : new DemoBackend()
}

export const backend: PeripheralBackend = createBackend()
export const demoBackend = backend instanceof DemoBackend ? backend : null

setDataSource(backend.mode)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 运行时校验快照结构，避免畸形 JSON 在拓扑 / 事件 / 设备页抛错。 */
function parseSnapshot(payload: unknown): RealSnapshot | null {
  if (!isRecord(payload)) return null

  const { devices, topology, diagnostics, events } = payload
  if (!Array.isArray(devices) || devices.length === 0) return null
  if (!isRecord(topology) || !Array.isArray(topology.nodes) || !Array.isArray(topology.edges)) {
    return null
  }
  if (!Array.isArray(diagnostics) || !Array.isArray(events)) return null
  if (
    !devices.every(
      (device) =>
        isRecord(device) &&
        typeof device.id === 'string' &&
        typeof device.name === 'string' &&
        isRecord(device.connection) &&
        isRecord(device.telemetry) &&
        Array.isArray(device.ports) &&
        Array.isArray(device.anchors),
    )
  ) {
    return null
  }

  return {
    scannedAt: typeof payload.scannedAt === 'number' ? payload.scannedAt : Date.now(),
    source: typeof payload.source === 'string' ? payload.source : 'unknown',
    deviceCount: typeof payload.deviceCount === 'number' ? payload.deviceCount : devices.length,
    devices: devices as unknown as DeviceSnapshot[],
    topology: topology as unknown as TopologyGraph,
    diagnostics: diagnostics as Diagnosis[],
    events: events as DeviceEventLog[],
  }
}

async function fetchSnapshot(): Promise<RealSnapshot | null> {
  if (typeof fetch !== 'function') return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(SNAPSHOT_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return null
    return parseSnapshot(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

let pendingLoad: Promise<boolean> | null = null

async function applyRealSnapshot(snapshot: RealSnapshot): Promise<boolean> {
  // 先发布数据源变更，再推送设备事件：订阅方据此识别「整源替换」，不发热插拔提示。
  setDataSource('snapshot', {
    scannedAt: snapshot.scannedAt,
    source: snapshot.source,
    deviceCount: snapshot.deviceCount,
  })
  demoBackend?.applySnapshot(snapshot)
  removeStorage(STORAGE_KEYS.dataSource)
  return true
}

/**
 * 浏览器模式下加载 scripts/build-snapshot.py 生成的本机真实扫描快照。
 * 同一时刻只保留一个请求，避免 StrictMode 双挂载导致重复加载与重复事件。
 * 返回 false 表示「保持当前数据源」，调用方据此决定是否提示。
 */
export function loadRealSnapshot(force = false): Promise<boolean> {
  if (getDataSource() === 'tauri' || !demoBackend) return Promise.resolve(false)
  if (!force && readStorage(STORAGE_KEYS.dataSource) === 'demo') return Promise.resolve(false)
  if (pendingLoad) return pendingLoad

  pendingLoad = fetchSnapshot()
    .then((snapshot) => (snapshot ? applyRealSnapshot(snapshot) : false))
    .finally(() => {
      pendingLoad = null
    })
  return pendingLoad
}

/** 切回演示数据，并记住选择，避免下次启动又自动载入扫描快照。 */
export function switchToDemoData(): void {
  if (!demoBackend) return
  setDataSource('demo')
  demoBackend.reset()
  writeStorage(STORAGE_KEYS.dataSource, 'demo')
}
