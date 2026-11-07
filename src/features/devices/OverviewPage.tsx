import {
  ArrowRight,
  Boxes,
  CircleAlert,
  Info,
  Layers3,
  PlugZap,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DiagnosticCard } from '@/components/common/DiagnosticCard'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { SectionCard } from '@/components/common/SectionCard'
import { Button } from '@/components/ui/button'
import { DeviceCard } from '@/features/devices/DeviceCard'
import { FilterBar } from '@/features/devices/FilterBar'
import { StatsStrip } from '@/features/devices/StatsStrip'
import { useDataSource } from '@/hooks/useDataSource'
import { useDiagnostics, useHotplugSimulation, useTopology } from '@/hooks/useDeviceData'
import { canSimulateHotplug, DATA_SOURCE_DETAIL_KEY } from '@/lib/dataSourceText'
import { cn, formatRelativeTime } from '@/lib/utils'
import { countWarnings, filterDevices, useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { DeviceSnapshot } from '@/types/device'

function ScanSummary({
  devices,
  diagnosticsCount,
  topologyNodes,
}: {
  devices: DeviceSnapshot[]
  diagnosticsCount: number
  topologyNodes: number
}) {
  const { t } = useTranslation()
  const { source } = useDataSource()
  const language = useSettingsStore((state) => state.language)
  const setPage = useUiStore((state) => state.setPage)
  const lastSync = useDeviceStore((state) => state.lastSync)
  const exact = devices.filter((device) => device.modelId).length
  const fallback = devices.length - exact

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const device of devices) map.set(device.category, (map.get(device.category) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [devices])

  return (
    <SectionCard
      title={t('overview.summary.title')}
      subtitle={t('overview.summary.subtitle')}
      action={
        <span className="font-mono text-[9px] text-ink-faint">
          {lastSync ? formatRelativeTime(lastSync, language) : '—'}
        </span>
      }
      bodyClassName="p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {[
          {
            icon: Layers3,
            label: t('overview.summary.topology'),
            value: topologyNodes,
            tone: 'text-accent',
          },
          {
            icon: CircleAlert,
            label: t('overview.summary.diagnostics'),
            value: diagnosticsCount,
            tone: 'text-amber-300',
          },
          {
            icon: Sparkles,
            label: t('overview.summary.exact'),
            value: exact,
            tone: 'text-emerald-300',
          },
          {
            icon: Boxes,
            label: t('overview.summary.fallback'),
            value: fallback,
            tone: 'text-ink-muted',
          },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="rounded-lg border border-white/[0.05] bg-white/[0.016] p-2.5"
            >
              <div className="flex items-center gap-1.5 text-ink-faint">
                <Icon className={cn('h-3 w-3', item.tone)} strokeWidth={1.8} />
                <span className="truncate text-[9.5px]">{item.label}</span>
              </div>
              <p className="metric-number mt-1.5 text-[17px] font-semibold text-ink">
                {item.value}
              </p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 space-y-2">
        {counts.map(([category, count]) => (
          <div key={category} className="flex items-center gap-2.5">
            <span className="w-[74px] shrink-0 truncate text-[10px] text-ink-muted">
              {t(`category.${category}`)}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.045]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[rgba(var(--accent-rgb),0.45)] to-[var(--accent)]"
                style={{ width: `${(count / Math.max(1, devices.length)) * 100}%` }}
              />
            </div>
            <span className="w-4 text-right font-mono text-[9px] text-ink-faint">{count}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.016] p-2.5">
        <Info className="mt-px h-3 w-3 shrink-0 text-ink-faint" strokeWidth={1.8} />
        <p className="text-[9.5px] leading-relaxed text-ink-faint">
          {source === 'demo' ? t('overview.summary.demoNote') : t(DATA_SOURCE_DETAIL_KEY[source])}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPage('topology')}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-[10.5px] text-ink-muted transition-colors hover:border-[rgba(var(--accent-rgb),0.3)] hover:text-ink"
      >
        {t('common.topology')}
        <ArrowRight className="h-3 w-3" />
      </button>
    </SectionCard>
  )
}

export function OverviewPage({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { t } = useTranslation()
  const { source } = useDataSource()
  const devices = useDeviceStore((state) => state.devices)
  const search = useDeviceStore((state) => state.search)
  const category = useDeviceStore((state) => state.category)
  const status = useDeviceStore((state) => state.status)
  const sort = useDeviceStore((state) => state.sort)
  const syncing = useDeviceStore((state) => state.syncing)
  const setStatus = useDeviceStore((state) => state.setStatus)
  const setSearch = useDeviceStore((state) => state.setSearch)
  const diagnostics = useDiagnostics()
  const topology = useTopology()
  const simulateHotplug = useHotplugSimulation()
  const setPage = useUiStore((state) => state.setPage)
  const language = useSettingsStore((state) => state.language)
  const lastSync = useDeviceStore((state) => state.lastSync)

  const filtered = useMemo(
    () => filterDevices(devices, search, category, status, sort),
    [devices, search, category, status, sort],
  )
  const warnings = countWarnings(devices)
  const deviceNames = useMemo(
    () => new Map(devices.map((device) => [device.id, device.name])),
    [devices],
  )

  return (
    <div className="mx-auto max-w-[1540px] px-4 py-5 xl:px-7 xl:py-6">
      <PageHeader
        eyebrow={
          <>
            <span className="text-accent/80">WORKSPACE</span>
            <span className="text-ink-faint/40">/</span>
            <span>DEVICE INDEX</span>
          </>
        }
        title={t('overview.title')}
        subtitle={t('overview.subtitle')}
        actions={
          <>
            {canSimulateHotplug(source) ? (
              <Button
                variant="secondary"
                size="md"
                icon={<PlugZap className="h-3.5 w-3.5" />}
                onClick={() => void simulateHotplug()}
              >
                {t('common.simulate')}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="md"
              icon={<RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />}
              onClick={() => void onRefresh()}
              disabled={syncing}
            >
              {syncing ? t('topbar.scanning') : t('overview.scan.refresh')}
            </Button>
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="live-dot scale-75" />
          {t('common.live')}
        </span>
        <span>
          {t('overview.scan.last')} ·{' '}
          <span className="text-ink-muted">
            {lastSync ? formatRelativeTime(lastSync, language) : '—'}
          </span>
        </span>
        <span className="hidden h-3 w-px bg-line sm:block" />
        <span className="hidden items-center gap-1.5 sm:flex">
          <ShieldCheck className="h-3 w-3 text-emerald-400/70" strokeWidth={1.8} />
          {t('common.readOnly')}
        </span>
        {warnings > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setStatus('warning')
            }}
            className="flex items-center gap-1.5 rounded-full border border-amber-400/18 bg-amber-400/[0.06] px-2 py-0.5 text-amber-300/85 transition-colors hover:bg-amber-400/[0.1]"
          >
            <CircleAlert className="h-2.5 w-2.5" />
            {warnings} {t('status.warning')}
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <StatsStrip devices={devices} />
      </div>

      <div className="mt-5">
        <FilterBar devices={devices} />
      </div>

      <div className="mt-4">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 min-[1360px]:grid-cols-3">
            {filtered.map((device, index) => (
              <DeviceCard key={device.id} device={device} index={index} />
            ))}
          </div>
        ) : devices.length === 0 && lastSync === 0 ? (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 min-[1360px]:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="panel h-[310px] overflow-hidden">
                <div className="shimmer h-[172px] border-b border-white/[0.04]" />
                <div className="space-y-2 p-4">
                  <div className="shimmer h-2 w-16 rounded" />
                  <div className="shimmer h-3.5 w-40 rounded" />
                  <div className="shimmer h-5 w-28 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : devices.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={t('source.noDevices')}
            description={t('source.noDevicesDetail')}
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={t('overview.empty.title')}
            description={t('overview.empty.detail')}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('')
                  useDeviceStore.getState().setCategory('all')
                  setStatus('all')
                }}
              >
                {t('overview.empty.reset')}
              </Button>
            }
          />
        )}
      </div>

      {devices.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-3.5 xl:grid-cols-[0.9fr_1.25fr]">
          <ScanSummary
            devices={devices}
            diagnosticsCount={diagnostics.data?.length ?? 0}
            topologyNodes={topology.data?.nodes.length ?? 0}
          />

          <SectionCard
            title={t('telemetry.insights.title')}
            subtitle={`${diagnostics.data?.length ?? 0} ${t('statusbar.warnings')}`}
            action={
              <button
                type="button"
                onClick={() => setPage('telemetry')}
                className="flex items-center gap-1 text-[9.5px] text-ink-faint transition-colors hover:text-accent"
              >
                {t('telemetry.insights.open')}
                <ArrowRight className="h-3 w-3" />
              </button>
            }
            bodyClassName="p-3"
          >
            <div className="space-y-2">
              {(diagnostics.data ?? []).slice(0, 4).map((diagnosis) => (
                <DiagnosticCard
                  key={diagnosis.id}
                  diagnosis={diagnosis}
                  deviceName={diagnosis.deviceId ? deviceNames.get(diagnosis.deviceId) : undefined}
                  compact
                />
              ))}
              {diagnostics.data?.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ShieldCheck className="h-6 w-6 text-emerald-400/70" strokeWidth={1.5} />
                  <p className="text-[11px] text-ink-faint">{t('telemetry.insights.empty')}</p>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      ) : null}

      <p className="mt-6 text-center font-mono text-[8.5px] uppercase tracking-[0.22em] text-ink-faint/35">
        PERIPHERY · READ-ONLY LOCAL INVENTORY · {new Date().getFullYear()}
      </p>
    </div>
  )
}
