import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useDataSource } from '@/hooks/useDataSource'
import { backend, loadRealSnapshot } from '@/lib/backend'
import { getDataSource, getSourceEpoch } from '@/lib/backend/source'
import { useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { MetricKey } from '@/types/device'

const QUERY_KEYS = ['devices', 'topology', 'diagnostics', 'events', 'telemetry'] as const

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useDeviceSync(): { refresh: () => Promise<void> } {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { source, epoch } = useDataSource()
  const replaceAll = useDeviceStore((state) => state.replaceAll)
  const setSyncing = useDeviceStore((state) => state.setSyncing)
  const telemetryEnabled = useSettingsStore((state) => state.telemetryEnabled)
  const pushToast = useUiStore((state) => state.pushToast)
  const previousIds = useRef<Map<string, string> | null>(null)
  const lastEpoch = useRef(getSourceEpoch())

  const query = useQuery({
    queryKey: ['devices'],
    queryFn: () => backend.listDevices(),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!query.data) return
    replaceAll(query.data)
    previousIds.current = new Map(query.data.map((device) => [device.id, device.name]))
  }, [query.data, replaceAll])

  // 数据源整体切换时，所有派生查询都必须重取，避免缓存里残留上一数据源的内容。
  useEffect(() => {
    lastEpoch.current = epoch
    previousIds.current = null
    for (const key of QUERY_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [epoch, queryClient])

  useEffect(() => {
    const unsubscribe = backend.onDevicesChanged((devices) => {
      const sourceEpoch = getSourceEpoch()
      const previous = sourceEpoch === lastEpoch.current ? previousIds.current : null
      lastEpoch.current = sourceEpoch

      // 只有同一数据源内的增量变化才是热插拔；换数据源是整源替换，不弹提示。
      if (previous) {
        const nextIds = new Set(devices.map((device) => device.id))
        for (const device of devices.filter((item) => !previous.has(item.id))) {
          pushToast({
            title: t('toast.hotplugOn', { name: device.name }),
            description: `${device.manufacturer} · ${device.connection.protocol}`,
            variant: 'success',
          })
        }
        for (const [id, name] of previous) {
          if (!nextIds.has(id)) {
            pushToast({ title: t('toast.hotplugOff', { name }), variant: 'warning' })
          }
        }
      }

      previousIds.current = new Map(devices.map((device) => [device.id, device.name]))
      replaceAll(devices)
    })

    return unsubscribe
  }, [pushToast, replaceAll, t])

  useEffect(() => {
    if (!telemetryEnabled || source !== 'demo') return
    const unsubscribe = backend.onTelemetry((sample) => {
      useDeviceStore.getState().applyTelemetry(sample)
    })
    return unsubscribe
  }, [telemetryEnabled, source])

  const refresh = useCallback(async () => {
    setSyncing(true)
    try {
      // 静态快照的「刷新」= 重新读取扫描文件；其余模式走后端主动刷新。
      if (source === 'snapshot') {
        const loaded = await loadRealSnapshot(true)
        if (!loaded) {
          pushToast({ title: t('source.scanFailed'), variant: 'warning' })
          return
        }
      } else {
        const devices = await backend.refreshDevices()
        replaceAll(devices)
      }
      for (const key of QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      pushToast({ title: t('toast.refreshed'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('toast.refreshFailed'),
        description: describeError(error),
        variant: 'error',
      })
    } finally {
      setSyncing(false)
    }
  }, [pushToast, queryClient, replaceAll, setSyncing, source, t])

  return { refresh }
}

export function useTopology() {
  return useQuery({
    queryKey: ['topology'],
    queryFn: () => backend.getTopology(),
    staleTime: 30_000,
  })
}

export function useDiagnostics() {
  return useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => backend.getDiagnostics(),
    staleTime: 30_000,
  })
}

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => backend.getEvents(),
    staleTime: 20_000,
  })
}

export function useTelemetryHistory(deviceId: string | null, metric: MetricKey, hours: number) {
  const { source } = useDataSource()
  return useQuery({
    queryKey: ['telemetry', deviceId, metric, hours, source],
    queryFn: () => backend.getTelemetryHistory(deviceId ?? '', metric, hours),
    enabled: Boolean(deviceId),
    staleTime: 4_000,
    // 快照是静态文件，没有实时采样，不必每 5 秒空轮询。
    refetchInterval: source === 'demo' ? 5_000 : false,
    refetchOnWindowFocus: false,
  })
}

export function useHotplugSimulation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const pushToast = useUiStore((state) => state.pushToast)

  return useCallback(async () => {
    if (getDataSource() !== 'demo' || !backend.simulateHotplug) {
      pushToast({ title: t('toast.unsupported'), variant: 'warning' })
      return
    }
    try {
      await backend.simulateHotplug()
      await queryClient.invalidateQueries({ queryKey: ['topology'] })
      await queryClient.invalidateQueries({ queryKey: ['diagnostics'] })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
    } catch (error) {
      pushToast({
        title: t('toast.refreshFailed'),
        description: describeError(error),
        variant: 'error',
      })
    }
  }, [pushToast, queryClient, t])
}
