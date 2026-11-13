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

/** 厂商电量探针的匹配与校准状态，来自 config/battery-probes.json 与用户覆盖层。 */
export interface BatteryProbeInfo {
  probeId: string
  vendor: string
  status: 'calibrated' | 'uncalibrated' | 'disabled' | 'error' | 'no-match'
  reason?: string | null
  /** false 表示厂商通道本身不含电量字段：应显示「无法读取」而非「待校准」。 */
  channelAvailable?: boolean
  /** 校准置信度：只有多点验证过的映射才配叫「已验证」。 */
  confidence?: CalibrationConfidence | null
  /** 电量的校准来源：内置基线或用户校准。 */
  calibratedBy?: 'bundled' | 'user' | null
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

/** 校准置信度：只有多点验证过的映射才配叫「已验证」。 */
export type CalibrationConfidence = 'unverified' | 'single-sample' | 'multi-sample' | 'verified'

/** 解码配置：内置基线（L0）与用户覆盖层（L1）共用同一结构。 */
export interface CalibrationDecode {
  status: 'calibrated' | 'uncalibrated' | 'disabled'
  percentReportId: number
  percentOffset: number | null
  percentScale: number
  percentRange: [number, number]
  charging?: { offset: number; mask?: number; valueWhenCharging?: number } | null
  /** 仅基线使用：通道本身不含电量字段时的说明。 */
  unavailableReason?: string | null
}

export interface CalibrationSample {
  /** 采样时厂商官方驱动显示的电量（0–100）。 */
  reference: number
  /** 原始报告 payload（hex，不含 Report ID）。 */
  raw: string
  reportId: number
  capturedAt: number
}

/** 用户校准覆盖层条目（L1），只能覆盖 decode，不能改 match / transport。 */
export interface CalibrationEntry {
  probeId: string
  serial?: string | null
  decode: CalibrationDecode
  confidence: CalibrationConfidence | ''
  samples: CalibrationSample[]
  calibratedAt: number
  source?: string | null
}

export interface BatteryChannel {
  probeId: string
  vendor: string
  displayName: string
  vendorId: number | null
  productIds: string[]
  usagePage: string
  usages: number[]
  transportKind: string
  reportIds: number[]
  reportLengths: Record<string, number>
  /** 当前机器上是否有匹配该探针的 HID 接口。 */
  present: boolean
  enabled: boolean
  status: 'calibrated' | 'uncalibrated' | 'disabled'
  channelAvailable: boolean
  reason?: string | null
  effectiveDecode: CalibrationDecode
  calibratedBy: 'bundled' | 'user'
  confidence?: CalibrationConfidence | null
  calibratedAt?: number | null
  samples: CalibrationSample[]
}

export interface ReportSamples {
  reportId: number
  length: number
  samples: string[]
  /** 多次采样完全相同：多半是事件触发型通道，需要先操作设备。 */
  stable: boolean
}

export interface BatterySampleResult {
  probeId: string
  capturedAt: number
  hidapiAvailable: boolean
  interfaces: string[]
  reports: ReportSamples[]
  errors: string[]
}

export interface CalibrationState {
  path: string
  healthy: boolean
  error?: string | null
  entries: CalibrationEntry[]
  channels: BatteryChannel[]
}

/** 未被任何探针匹配的厂商 HID 接口（只读扫描结果）。 */
export interface UnmatchedInterface {
  vendorId: number
  productId: number
  usagePage: number
  usage: number
  interface: number
  manufacturer: string
  product: string
  reports: ReportSamples[]
  pathHint: string
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
  /** 电量校准：仅桌面端（tauri）实现；浏览器快照 / 演示模式不提供，界面据此降级。 */
  batteryChannels?(): Promise<BatteryChannel[]>
  batterySample?(probeId: string, times?: number): Promise<BatterySampleResult>
  batteryCalibrationState?(): Promise<CalibrationState>
  batteryCalibrationSave?(entry: CalibrationEntry): Promise<CalibrationState>
  batteryCalibrationReset?(probeId: string, serial?: string | null): Promise<CalibrationState>
  batteryCalibrationExport?(): Promise<string>
  batteryCalibrationImport?(json: string): Promise<CalibrationState>
  batteryScanUnmatched?(maxReportId?: number): Promise<UnmatchedInterface[]>
}
