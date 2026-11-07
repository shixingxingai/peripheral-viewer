import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeskLayout, DeviceSnapshot } from '@/types/device'
import { DemoBackend } from './demo'

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

describe('DemoBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageStub())
  })

  it('列出设备且每个设备符合 DeviceSnapshot 契约', async () => {
    const backend = new DemoBackend()
    const devices = await backend.listDevices()

    expect(devices.length).toBeGreaterThan(5)
    expect(new Set(devices.map((device) => device.id)).size).toBe(devices.length)

    for (const device of devices) {
      expect(device.id).toBeTruthy()
      expect(device.name).toBeTruthy()
      expect(device.vendorId).toBeGreaterThan(0)
      expect(Array.isArray(device.ports)).toBe(true)
      expect(Array.isArray(device.anchors)).toBe(true)
      expect(device.firstSeen).toBeGreaterThan(0)
      expect(device.lastSeen).toBeGreaterThanOrEqual(device.firstSeen)
      expect([
        'keyboard',
        'mouse',
        'headset',
        'monitor',
        'webcam',
        'gamepad',
        'microphone',
        'speaker',
        'other',
      ]).toContain(device.category)
    }
  })

  it('返回深拷贝，外部修改不会污染内部状态', async () => {
    const backend = new DemoBackend()
    const first = await backend.listDevices()
    first[0].name = 'MUTATED'
    first[0].ports[0].label = 'MUTATED'
    first[0].telemetry.dpi = -1

    const second = await backend.listDevices()
    expect(second[0].name).not.toBe('MUTATED')
    expect(second[0].ports[0].label).not.toBe('MUTATED')
    expect(second[0].telemetry.dpi).not.toBe(-1)
  })

  it('模拟热插拔会增删设备并广播变更', async () => {
    const backend = new DemoBackend()
    const snapshots: DeviceSnapshot[][] = []
    const stop = backend.onDevicesChanged((devices) => snapshots.push(devices))

    const connected = await backend.simulateHotplug()
    expect(connected.type).toBe('connected')
    expect(snapshots.at(-1)?.some((device) => device.name === connected.deviceName)).toBe(true)

    const disconnected = await backend.simulateHotplug()
    expect(disconnected.type).toBe('disconnected')
    expect(snapshots.at(-1)?.some((device) => device.name === connected.deviceName)).toBe(false)

    const events = await backend.getEvents()
    expect(events.some((event) => event.message.includes(connected.deviceName))).toBe(true)
    stop()
  })

  it('遥测历史按时间升序生成且数值有限', async () => {
    const backend = new DemoBackend()
    const devices = await backend.listDevices()
    const target = devices.find((device) => device.telemetry.pollingRate != null)
    expect(target).toBeDefined()

    const points = await backend.getTelemetryHistory(target?.id ?? '', 'pollingRate', 6)
    expect(points.length).toBe(96)
    expect(points.every((point) => Number.isFinite(point.value))).toBe(true)
    for (let index = 1; index < points.length; index++) {
      expect(points[index].ts).toBeGreaterThan(points[index - 1].ts)
    }
  })

  it('布局保存后可读取且写入时间戳', async () => {
    const backend = new DemoBackend()
    const layout: DeskLayout = {
      id: 'layout-1',
      name: '桌面',
      items: [{ deviceId: 'device-1', x: 12, y: 34, rotation: 0, scale: 1 }],
      updatedAt: 0,
    }

    await backend.saveLayout(layout)
    const loaded = await backend.loadLayout()

    expect(loaded?.name).toBe('桌面')
    expect(loaded?.items).toHaveLength(1)
    expect(loaded?.items[0].x).toBe(12)
    expect(loaded?.updatedAt).toBeGreaterThan(0)
  })

  it('拓扑、诊断与事件接口返回自洽数据', async () => {
    const backend = new DemoBackend()
    const graph = await backend.getTopology()

    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(
      graph.edges.every(
        (edge) =>
          graph.nodes.some((node) => node.id === edge.source) &&
          graph.nodes.some((node) => node.id === edge.target),
      ),
    ).toBe(true)
    expect(Array.isArray(await backend.getDiagnostics())).toBe(true)

    const events = await backend.getEvents()
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].ts).toBeGreaterThanOrEqual(events.at(-1)?.ts ?? 0)
  })
})
