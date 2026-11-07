import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage'
import type {
  DataSource,
  DeskLayout,
  DeviceEventLog,
  DeviceSnapshot,
  Diagnosis,
  MetricKey,
  PeripheralBackend,
  RealSnapshot,
  TelemetryPoint,
  TelemetrySample,
  TopologyGraph,
} from '@/types/device'
import {
  buildDemoDevices,
  buildDemoDiagnostics,
  buildDemoEvents,
  buildDemoTopology,
} from './demoData'

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function metricBaseline(device: DeviceSnapshot, metric: MetricKey): number | null {
  switch (metric) {
    case 'battery':
      return device.battery ?? null
    case 'pollingRate':
      return device.telemetry.pollingRate ?? null
    case 'dpi':
      return device.telemetry.dpi ?? null
    case 'signal':
      return device.telemetry.signal ?? null
    case 'temperature':
      return device.telemetry.temperature ?? null
    case 'latency':
      return device.telemetry.latency ?? null
    default:
      return null
  }
}

function generateHistory(
  device: DeviceSnapshot,
  metric: MetricKey,
  hours: number,
): TelemetryPoint[] {
  const baseline = metricBaseline(device, metric)
  if (baseline === null) return []

  const points = 96
  const end = Date.now()
  const start = end - hours * 3600 * 1000
  const step = (end - start) / (points - 1)
  const random = mulberry32(hashString(`${device.id}:${metric}:${hours}`))
  const series: TelemetryPoint[] = []

  let drift = 0
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1)
    const noise = (random() - 0.5) * 2
    let value = baseline

    switch (metric) {
      case 'battery':
        value = baseline + (1 - progress) * Math.min(6, hours * 0.22) + noise * 0.15
        break
      case 'pollingRate':
        value = baseline * (1 + noise * 0.018)
        break
      case 'dpi':
        if (random() > 0.94) drift = (random() - 0.5) * 800
        value = baseline + drift
        break
      case 'signal':
        value = baseline + noise * 3.4 + Math.sin(progress * Math.PI * 3) * 1.4
        break
      case 'temperature':
        value = baseline + noise * 0.8 + Math.sin(progress * Math.PI * 2) * 0.9
        break
      case 'latency':
        value = Math.max(0.4, baseline + noise * (baseline * 0.16))
        break
      default:
        break
    }

    series.push({
      ts: Math.round(start + step * i),
      value: Number(value.toFixed(metric === 'battery' ? 1 : 2)),
    })
  }

  return series
}

function cloneDevices(devices: DeviceSnapshot[]): DeviceSnapshot[] {
  return devices.map((device) => ({
    ...device,
    connection: { ...device.connection },
    telemetry: { ...device.telemetry },
    ports: device.ports.map((port) => ({ ...port })),
    anchors: device.anchors.map((anchor) => ({ ...anchor })),
    rgb: device.rgb ? { ...device.rgb } : null,
  }))
}

const HOTPLUG_DEVICE: DeviceSnapshot = {
  id: '3e5a8c1d7b2f4960',
  modelId: 'razer-viper-v3-pro',
  name: 'Viper V3 Pro',
  manufacturer: 'Razer',
  vendorId: 0x1532,
  productId: 0x00b8,
  serial: 'RZ01-0512-0021',
  category: 'mouse',
  connection: {
    kind: 'wireless',
    protocol: 'HyperSpeed 2.4 GHz',
    speed: '1 ms',
    receiver: 'HyperSpeed USB-A 接收器',
    signal: -47,
    signalQuality: 86,
  },
  status: 'online',
  battery: 94,
  charging: false,
  firmware: '1.03.02',
  location: 'Port_#0009.Hub_#0001',
  capabilities: ['battery', 'dpi', 'polling_rate', 'rgb'],
  ports: [
    { id: 'wireless', label: 'HyperSpeed 接收器', kind: 'wireless', status: 'linked' },
    { id: 'usb-c', label: 'USB-C 充电', kind: 'usb-c', status: 'idle' },
  ],
  anchors: [
    { id: 'usb', label: 'USB-C 接口', position: [0, 0.024, -0.06], kind: 'port' },
    { id: 'sensor', label: 'Focus Pro 30K', position: [0, 0.002, 0.005], kind: 'feature' },
    { id: 'logo', label: 'RGB Logo', position: [0, 0.05, 0.018], kind: 'rgb' },
  ],
  telemetry: { pollingRate: 1000, dpi: 1600, signal: -47, temperature: 27, latency: 1.1 },
  rgb: { enabled: true, color: '#a3e635', mode: 'static' },
  accent: '#a3e635',
  firstSeen: Date.now() - 1000 * 60 * 60 * 24 * 30,
  lastSeen: Date.now(),
  reconnectCount: 0,
}

export class DemoBackend implements PeripheralBackend {
  mode: DataSource = 'demo'
  private devices = buildDemoDevices()
  private snapshot: RealSnapshot | null = null
  private deviceListeners = new Set<(devices: DeviceSnapshot[]) => void>()
  private telemetryListeners = new Set<(sample: TelemetrySample) => void>()
  private events = buildDemoEvents(this.devices)
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private hotplugConnected = false
  private tick = 0

  applySnapshot(snapshot: RealSnapshot): void {
    this.mode = 'snapshot'
    this.snapshot = snapshot
    this.devices = cloneDevices(snapshot.devices)
    this.events = snapshot.events.map((event) => ({ ...event }))
    this.hotplugConnected = false
    this.stopTicker()
    this.emitDevices()
  }

  listDevices(): Promise<DeviceSnapshot[]> {
    return Promise.resolve(cloneDevices(this.devices))
  }

  refreshDevices(): Promise<DeviceSnapshot[]> {
    // 静态快照的刷新由 loadRealSnapshot 重新抓取文件完成，此处不伪造「已刷新」事件。
    if (this.snapshot) return Promise.resolve(cloneDevices(this.devices))
    const now = Date.now()
    this.devices = this.devices.map((device) => ({ ...device, lastSeen: now }))
    this.emitDevices()
    return Promise.resolve(cloneDevices(this.devices))
  }

  getTopology(): Promise<TopologyGraph> {
    if (this.snapshot) return Promise.resolve(this.snapshot.topology)
    return Promise.resolve(buildDemoTopology(this.devices))
  }

  getDiagnostics(): Promise<Diagnosis[]> {
    if (this.snapshot) return Promise.resolve(this.snapshot.diagnostics)
    return Promise.resolve(buildDemoDiagnostics(this.devices))
  }

  getEvents(): Promise<DeviceEventLog[]> {
    if (this.snapshot) return Promise.resolve([...this.snapshot.events].sort((a, b) => b.ts - a.ts))
    return Promise.resolve([...this.events].sort((a, b) => b.ts - a.ts))
  }

  getTelemetryHistory(
    deviceId: string,
    metric: MetricKey,
    hours: number,
  ): Promise<TelemetryPoint[]> {
    if (this.snapshot) return Promise.resolve([])
    const device = this.devices.find((item) => item.id === deviceId)
    if (!device) return Promise.resolve([])
    return Promise.resolve(generateHistory(device, metric, hours))
  }

  async saveLayout(layout: DeskLayout): Promise<void> {
    const payload = { ...layout, updatedAt: Date.now() }
    writeJson(STORAGE_KEYS.layout, payload)
  }

  async loadLayout(): Promise<DeskLayout | null> {
    return readJson<DeskLayout>(STORAGE_KEYS.layout)
  }

  onDevicesChanged(cb: (devices: DeviceSnapshot[]) => void): () => void {
    this.deviceListeners.add(cb)
    return () => this.deviceListeners.delete(cb)
  }

  onTelemetry(cb: (sample: TelemetrySample) => void): () => void {
    this.telemetryListeners.add(cb)
    if (!this.snapshot && this.telemetryListeners.size === 1) this.startTicker()
    return () => {
      this.telemetryListeners.delete(cb)
      if (this.telemetryListeners.size === 0) this.stopTicker()
    }
  }

  async simulateHotplug(): Promise<{ type: 'connected' | 'disconnected'; deviceName: string }> {
    if (this.snapshot) throw new Error('真实扫描快照模式下不支持模拟热插拔')
    this.hotplugConnected = !this.hotplugConnected

    if (this.hotplugConnected) {
      this.devices = [...this.devices, { ...HOTPLUG_DEVICE, lastSeen: Date.now() }]
      this.events = [
        {
          id: `evt-hotplug-${Date.now()}`,
          ts: Date.now(),
          kind: 'connected',
          deviceId: HOTPLUG_DEVICE.id,
          message: `${HOTPLUG_DEVICE.name} 已连接 · ${HOTPLUG_DEVICE.connection.protocol}`,
        },
        ...this.events,
      ]
      this.emitDevices()
      return { type: 'connected', deviceName: HOTPLUG_DEVICE.name }
    }

    this.devices = this.devices.filter((device) => device.id !== HOTPLUG_DEVICE.id)
    this.events = [
      {
        id: `evt-hotplug-${Date.now()}`,
        ts: Date.now(),
        kind: 'disconnected',
        deviceId: HOTPLUG_DEVICE.id,
        message: `${HOTPLUG_DEVICE.name} 已断开`,
      },
      ...this.events,
    ]
    this.emitDevices()
    return { type: 'disconnected', deviceName: HOTPLUG_DEVICE.name }
  }

  reset(): void {
    this.mode = 'demo'
    this.snapshot = null
    this.devices = buildDemoDevices()
    this.events = buildDemoEvents(this.devices)
    this.hotplugConnected = false
    this.emitDevices()
    if (this.telemetryListeners.size > 0) this.startTicker()
  }

  private emitDevices(): void {
    const snapshot = cloneDevices(this.devices)
    for (const listener of this.deviceListeners) listener(snapshot)
  }

  private startTicker(): void {
    if (this.timers.has('tick')) return
    const timer = setInterval(() => this.produceSample(), 1000)
    this.timers.set('tick', timer)
  }

  private stopTicker(): void {
    const timer = this.timers.get('tick')
    if (timer) clearInterval(timer)
    this.timers.delete('tick')
  }

  private produceSample(): void {
    if (this.snapshot) return
    this.tick++
    const random = mulberry32(Date.now() & 0xffffffff)
    const jitter = (range: number) => (random() - 0.5) * range

    this.devices = this.devices.map((device) => {
      const telemetry = { ...device.telemetry }
      let battery = device.battery

      if (device.telemetry.pollingRate !== null && device.telemetry.pollingRate !== undefined) {
        telemetry.pollingRate = Math.max(60, Math.round(device.telemetry.pollingRate + jitter(8)))
      }
      if (device.telemetry.signal !== null && device.telemetry.signal !== undefined) {
        telemetry.signal = Number(
          Math.min(-30, Math.max(-82, device.telemetry.signal + jitter(2.4))).toFixed(1),
        )
      }
      if (device.telemetry.temperature !== null && device.telemetry.temperature !== undefined) {
        telemetry.temperature = Number(
          Math.max(24, device.telemetry.temperature + jitter(0.35)).toFixed(1),
        )
      }
      if (device.telemetry.latency !== null && device.telemetry.latency !== undefined) {
        telemetry.latency = Number(Math.max(0.4, device.telemetry.latency + jitter(0.3)).toFixed(2))
      }
      if (typeof battery === 'number' && !device.charging && this.tick % 30 === 0) {
        battery = Math.max(0, battery - (battery > 30 ? 0.1 : 0.05))
        battery = Number(battery.toFixed(1))
      }

      return { ...device, telemetry, battery }
    })

    const sample: TelemetrySample = { deviceId: '', ts: Date.now() }
    for (const device of this.devices) {
      const payload: TelemetrySample = {
        ...sample,
        deviceId: device.id,
        battery: device.battery ?? undefined,
        pollingRate: device.telemetry.pollingRate ?? undefined,
        dpi: device.telemetry.dpi ?? undefined,
        signal: device.telemetry.signal ?? undefined,
        temperature: device.telemetry.temperature ?? undefined,
        latency: device.telemetry.latency ?? undefined,
      }
      for (const listener of this.telemetryListeners) listener(payload)
    }
  }
}
