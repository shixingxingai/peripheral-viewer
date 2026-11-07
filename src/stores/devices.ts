import { create } from 'zustand'
import type { DeviceCategory, DeviceSnapshot, DeviceStatus, TelemetrySample } from '@/types/device'

export type SortKey = 'name' | 'recent' | 'battery'
export type StatusFilter = 'all' | 'online' | 'warning'
export type CategoryFilter = DeviceCategory | 'all'

interface DeviceState {
  devices: DeviceSnapshot[]
  selectedId: string | null
  search: string
  category: CategoryFilter
  status: StatusFilter
  sort: SortKey
  lastSync: number
  syncing: boolean
  replaceAll: (devices: DeviceSnapshot[]) => void
  applyTelemetry: (sample: TelemetrySample) => void
  select: (id: string | null) => void
  setSearch: (value: string) => void
  setCategory: (value: CategoryFilter) => void
  setStatus: (value: StatusFilter) => void
  setSort: (value: SortKey) => void
  setSyncing: (value: boolean) => void
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [],
  selectedId: null,
  search: '',
  category: 'all',
  status: 'all',
  sort: 'recent',
  lastSync: 0,
  syncing: false,
  replaceAll: (devices) =>
    set((state) => {
      const selectedExists = devices.some((device) => device.id === state.selectedId)
      return {
        devices,
        selectedId: selectedExists ? state.selectedId : (devices[0]?.id ?? null),
        lastSync: Date.now(),
      }
    }),
  applyTelemetry: (sample) =>
    set((state) => ({
      devices: state.devices.map((device) => {
        if (device.id !== sample.deviceId) return device
        return {
          ...device,
          battery: sample.battery ?? device.battery,
          telemetry: {
            ...device.telemetry,
            pollingRate: sample.pollingRate ?? device.telemetry.pollingRate,
            dpi: sample.dpi ?? device.telemetry.dpi,
            signal: sample.signal ?? device.telemetry.signal,
            temperature: sample.temperature ?? device.telemetry.temperature,
            latency: sample.latency ?? device.telemetry.latency,
          },
          lastSeen: sample.ts,
        }
      }),
    })),
  select: (id) => set({ selectedId: id }),
  setSearch: (value) => set({ search: value }),
  setCategory: (value) => set({ category: value }),
  setStatus: (value) => set({ status: value }),
  setSort: (value) => set({ sort: value }),
  setSyncing: (value) => set({ syncing: value }),
}))

export function filterDevices(
  devices: DeviceSnapshot[],
  search: string,
  category: CategoryFilter,
  status: StatusFilter,
  sort: SortKey,
): DeviceSnapshot[] {
  const query = search.trim().toLowerCase()
  const filtered = devices.filter((device) => {
    if (category !== 'all' && device.category !== category) return false
    if (status === 'online' && device.status === 'offline') return false
    if (status === 'warning' && device.status !== 'warning') return false
    if (!query) return true
    const haystack = [
      device.name,
      device.manufacturer,
      device.serial ?? '',
      device.connection.protocol,
      device.modelId ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })

  return filtered.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    if (sort === 'battery') return (b.battery ?? -1) - (a.battery ?? -1)
    return b.lastSeen - a.lastSeen
  })
}

export function countWarnings(devices: DeviceSnapshot[]): number {
  return devices.filter((device) => device.status === 'warning').length
}

export function statusLabelKey(status: DeviceStatus): string {
  switch (status) {
    case 'online':
      return 'status.online'
    case 'warning':
      return 'status.warning'
    case 'idle':
      return 'status.idle'
    default:
      return 'status.offline'
  }
}
