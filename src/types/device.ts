export type DeviceCategory =
  | 'keyboard'
  | 'mouse'
  | 'headset'
  | 'monitor'
  | 'webcam'
  | 'gamepad'
  | 'microphone'
  | 'speaker'
  | 'other'

export type ConnectionKind = 'usb' | 'wireless' | 'bluetooth' | 'wired'

export type DeviceStatus = 'online' | 'idle' | 'warning' | 'offline'

export type MetricKey = 'battery' | 'pollingRate' | 'dpi' | 'signal' | 'temperature' | 'latency'

export type PortKind = 'usb-c' | 'usb-a' | 'wireless' | 'audio' | 'display' | 'power'

export type AnchorKind = 'port' | 'feature' | 'rgb'

export interface DeviceConnection {
  kind: ConnectionKind
  protocol: string
  speed?: string
  receiver?: string
  signal?: number
  signalQuality?: number
}

export interface DevicePort {
  id: string
  label: string
  kind: PortKind
  speed?: string
  status: 'linked' | 'idle' | 'warning'
  note?: string
}

export interface DeviceAnchor {
  id: string
  label: string
  position: [number, number, number]
  kind: AnchorKind
}

export interface RgbState {
  enabled: boolean
  color: string
  mode: 'static' | 'wave' | 'breathing' | 'off'
}

export interface DeviceTelemetry {
  pollingRate?: number | null
  dpi?: number | null
  signal?: number | null
  temperature?: number | null
  latency?: number | null
}

/** 厂商电量探针的匹配与校准状态，来自 config/battery-probes.json。 */
export interface BatteryProbeInfo {
  probeId: string
  vendor: string
  status: 'calibrated' | 'uncalibrated' | 'disabled' | 'error' | 'no-match'
  reason?: string | null
}

export interface DeviceSnapshot {
  id: string
  modelId?: string | null
  name: string
  manufacturer: string
  vendorId: number
  productId: number
  serial?: string | null
  category: DeviceCategory
  connection: DeviceConnection
  status: DeviceStatus
  battery?: number | null
  charging?: boolean
  batteryProbe?: BatteryProbeInfo | null
  firmware?: string | null
  location?: string | null
  interfaceNumber?: number | null
  usagePage?: number | null
  usage?: number | null
  capabilities: string[]
  ports: DevicePort[]
  anchors: DeviceAnchor[]
  telemetry: DeviceTelemetry
  rgb?: RgbState | null
  accent: string
  firstSeen: number
  lastSeen: number
  reconnectCount: number
}

export interface TelemetrySample {
  deviceId: string
  ts: number
  battery?: number
  pollingRate?: number
  dpi?: number
  signal?: number
  temperature?: number
  latency?: number
}

export interface TelemetryPoint {
  ts: number
  value: number
}

export type Severity = 'info' | 'warning' | 'critical'

export interface Diagnosis {
  id: string
  severity: Severity
  scope: 'device' | 'topology' | 'system'
  deviceId?: string
  title: string
  detail: string
  suggestion: string
  createdAt: number
}

export type TopologyNodeType = 'host' | 'controller' | 'hub' | 'device' | 'radio' | 'display'
export type TopologyStatus = 'ok' | 'warning' | 'critical' | 'idle'

export interface TopologyNode {
  id: string
  type: TopologyNodeType
  label: string
  subtitle?: string
  status: TopologyStatus
  deviceId?: string
  parentId?: string
  meta?: Record<string, string>
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  label?: string
  status?: 'ok' | 'warning'
  speed?: string
}

export interface TopologyGraph {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  scannedAt: number
}

export interface LayoutItem {
  deviceId: string
  x: number
  y: number
  rotation: number
  scale: number
}

export interface DeskLayout {
  id: string
  name: string
  items: LayoutItem[]
  updatedAt: number
}

export interface DeviceEventLog {
  id: string
  ts: number
  kind: 'connected' | 'disconnected' | 'warning' | 'info'
  deviceId?: string
  message: string
}

export type PageId = 'overview' | 'viewer' | 'topology' | 'telemetry' | 'layout' | 'settings'

/** 三态数据源：原生设备层 / 本机扫描快照 / 演示数据。 */
export type DataSource = 'tauri' | 'snapshot' | 'demo'

export interface RealSnapshot {
  scannedAt: number
  source: string
  deviceCount: number
  devices: DeviceSnapshot[]
  topology: TopologyGraph
  diagnostics: Diagnosis[]
  events: DeviceEventLog[]
}

export interface PeripheralBackend {
  readonly mode: DataSource
  listDevices(): Promise<DeviceSnapshot[]>
  refreshDevices(): Promise<DeviceSnapshot[]>
  getTopology(): Promise<TopologyGraph>
  getDiagnostics(): Promise<Diagnosis[]>
  getEvents(): Promise<DeviceEventLog[]>
  getTelemetryHistory(deviceId: string, metric: MetricKey, hours: number): Promise<TelemetryPoint[]>
  saveLayout(layout: DeskLayout): Promise<void>
  loadLayout(): Promise<DeskLayout | null>
  onDevicesChanged(cb: (devices: DeviceSnapshot[]) => void): () => void
  onTelemetry(cb: (sample: TelemetrySample) => void): () => void
  simulateHotplug?(): Promise<{ type: 'connected' | 'disconnected'; deviceName: string }>
}
