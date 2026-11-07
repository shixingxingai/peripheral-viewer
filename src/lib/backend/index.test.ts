import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealSnapshot } from '@/types/device'
import { buildDemoDevices } from './demoData'
import { backend, demoBackend, loadRealSnapshot, switchToDemoData } from './index'
import { getDataSource, getDataSourceState, getSourceEpoch } from './source'

function localStorageStub() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

function snapshotPayload(): RealSnapshot {
  const devices = buildDemoDevices()
    .slice(0, 2)
    .map((device) => ({
      ...device,
      battery: null,
      charging: false,
      firmware: null,
      rgb: null,
      telemetry: {
        pollingRate: null,
        dpi: null,
        signal: null,
        temperature: null,
        latency: null,
      },
    }))
  return {
    scannedAt: 1_700_000_000_000,
    source: 'unit-test',
    deviceCount: devices.length,
    devices,
    topology: {
      nodes: [{ id: 'host', type: 'host', label: '本机', status: 'ok' }],
      edges: [],
      scannedAt: 1_700_000_000_000,
    },
    diagnostics: [],
    events: [{ id: 'evt-scan', ts: 1_700_000_000_000, kind: 'info', message: '扫描完成' }],
  }
}

describe('真实设备快照接入', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageStub())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => snapshotPayload() })),
    )
  })

  afterEach(() => {
    switchToDemoData()
    vi.unstubAllGlobals()
  })

  it('加载快照后切换为 snapshot 数据源并记录元数据', async () => {
    const epochBefore = getSourceEpoch()
    expect(getDataSource()).toBe('demo')
    expect(await loadRealSnapshot(true)).toBe(true)

    expect(getDataSource()).toBe('snapshot')
    expect(getSourceEpoch()).toBeGreaterThan(epochBefore)
    expect(getDataSourceState().meta).toEqual({
      scannedAt: 1_700_000_000_000,
      source: 'unit-test',
      deviceCount: 2,
    })
    expect(await backend.listDevices()).toHaveLength(2)
    expect((await backend.getTopology()).nodes[0].label).toBe('本机')
    expect(await backend.getEvents()).toHaveLength(1)
  })

  it('快照模式不生成任何伪造遥测数据', async () => {
    await loadRealSnapshot(true)
    const devices = await backend.listDevices()

    expect(await backend.getTelemetryHistory(devices[0].id, 'battery', 6)).toEqual([])
    for (const device of devices) {
      expect(device.battery).toBeNull()
      expect(device.telemetry.pollingRate).toBeNull()
    }
  })

  it('切回演示数据后记住选择，不再自动载入快照', async () => {
    await loadRealSnapshot(true)
    switchToDemoData()

    expect(getDataSource()).toBe('demo')
    expect(await loadRealSnapshot()).toBe(false)
    expect(await backend.listDevices()).not.toHaveLength(2)
  })

  it('快照不可用时保持演示模式', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    )
    expect(await loadRealSnapshot(true)).toBe(false)
    expect(getDataSource()).toBe('demo')
  })

  it('畸形快照被拒绝，不会污染当前数据源', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ devices: [{ id: 'x' }] }) })),
    )
    expect(await loadRealSnapshot(true)).toBe(false)
    expect(getDataSource()).toBe('demo')
    expect(demoBackend?.mode).toBe('demo')
  })

  it('快照模式下拒绝模拟热插拔，避免假设备混入真实数据', async () => {
    await loadRealSnapshot(true)
    expect(backend.simulateHotplug).toBeDefined()
    await expect(backend.simulateHotplug?.()).rejects.toThrow('不支持模拟热插拔')
  })
})
