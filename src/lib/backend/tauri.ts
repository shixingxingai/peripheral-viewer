import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  BatteryChannel,
  BatterySampleResult,
  CalibrationEntry,
  CalibrationState,
  DeskLayout,
  DeviceEventLog,
  DeviceSnapshot,
  Diagnosis,
  MetricKey,
  PeripheralBackend,
  TelemetryPoint,
  TelemetrySample,
  TopologyGraph,
  UnmatchedInterface,
} from '@/types/device'

export class TauriBackend implements PeripheralBackend {
  readonly mode = 'tauri' as const

  listDevices(): Promise<DeviceSnapshot[]> {
    return invoke<DeviceSnapshot[]>('list_devices')
  }

  refreshDevices(): Promise<DeviceSnapshot[]> {
    return invoke<DeviceSnapshot[]>('refresh_devices')
  }

  getTopology(): Promise<TopologyGraph> {
    return invoke<TopologyGraph>('get_topology')
  }

  getDiagnostics(): Promise<Diagnosis[]> {
    return invoke<Diagnosis[]>('get_diagnostics')
  }

  getEvents(): Promise<DeviceEventLog[]> {
    return invoke<DeviceEventLog[]>('get_events')
  }

  getTelemetryHistory(
    deviceId: string,
    metric: MetricKey,
    hours: number,
  ): Promise<TelemetryPoint[]> {
    return invoke<TelemetryPoint[]>('get_telemetry_history', { deviceId, metric, hours })
  }

  saveLayout(layout: DeskLayout): Promise<void> {
    return invoke<void>('save_layout', { layout })
  }

  loadLayout(): Promise<DeskLayout | null> {
    return invoke<DeskLayout | null>('load_layout')
  }

  onDevicesChanged(cb: (devices: DeviceSnapshot[]) => void): () => void {
    return subscribe<DeviceSnapshot[]>('devices://changed', cb)
  }

  onTelemetry(cb: (sample: TelemetrySample) => void): () => void {
    return subscribe<TelemetrySample>('telemetry://frame', cb)
  }

  // 电量校准：只读采样 + 用户覆盖层。写操作只落在本地配置文件，不写设备。

  batteryChannels(): Promise<BatteryChannel[]> {
    return invoke<BatteryChannel[]>('battery_channels')
  }

  batterySample(probeId: string, times = 3): Promise<BatterySampleResult> {
    return invoke<BatterySampleResult>('battery_sample', { probeId, times })
  }

  batteryCalibrationState(): Promise<CalibrationState> {
    return invoke<CalibrationState>('battery_calibration_state')
  }

  batteryCalibrationSave(entry: CalibrationEntry): Promise<CalibrationState> {
    return invoke<CalibrationState>('battery_calibration_save', { entry })
  }

  batteryCalibrationReset(
    probeId: string,
    serial: string | null = null,
  ): Promise<CalibrationState> {
    return invoke<CalibrationState>('battery_calibration_reset', { probeId, serial })
  }

  batteryCalibrationExport(): Promise<string> {
    return invoke<string>('battery_calibration_export')
  }

  batteryCalibrationImport(json: string): Promise<CalibrationState> {
    return invoke<CalibrationState>('battery_calibration_import', { json })
  }

  batteryScanUnmatched(maxReportId = 8): Promise<UnmatchedInterface[]> {
    return invoke<UnmatchedInterface[]>('battery_scan_unmatched', { maxReportId })
  }
}

function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let disposed = false
  let unlisten: UnlistenFn | undefined

  listen<T>(event, (payload) => cb(payload.payload))
    .then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    .catch((error: unknown) => {
      // 监听建立失败时降级为主动刷新，不让 Promise 拒绝冒到全局。
      console.warn('[tauri] 事件订阅失败，设备数据将通过主动刷新获取', error)
    })

  return () => {
    disposed = true
    unlisten?.()
  }
}
