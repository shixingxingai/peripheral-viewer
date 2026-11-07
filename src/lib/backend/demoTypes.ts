import type { DeviceSnapshot } from '@/types/device'

export type DemoDeviceSeed = Omit<DeviceSnapshot, 'ports' | 'anchors' | 'firstSeen' | 'lastSeen'>
