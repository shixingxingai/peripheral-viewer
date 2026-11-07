import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  BatteryCharging,
  Box,
  Cpu,
  Crosshair,
  Gauge,
  Hash,
  Info,
  MapPin,
  Network,
  Plug,
  Radio,
  ShieldCheck,
  Signal,
  Thermometer,
  Timer,
  Usb,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BatteryRing } from '@/components/common/BatteryRing'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ConnectionBadge, PortStatusBadge, StatusBadge } from '@/components/common/ConnectionBadge'
import { DeviceGlyph } from '@/components/common/DeviceGlyph'
import { DiagnosticCard } from '@/components/common/DiagnosticCard'
import { InfoRow } from '@/components/common/InfoRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDiagnostics } from '@/hooks/useDeviceData'
import { cn, formatRelativeTime, hexToRgba, shortId } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { DevicePort } from '@/types/device'

type Tab = 'overview' | 'ports' | 'health'

const PORT_ICONS = {
  'usb-c': Usb,
  'usb-a': Usb,
  wireless: Radio,
  audio: Plug,
  display: Box,
  power: BatteryCharging,
} as const

function MetricTile({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  unit?: string
  icon: typeof Gauge
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
      <div className="flex items-center gap-1.5 text-ink-faint">
        <Icon className="h-3 w-3" strokeWidth={1.8} />
        <span className="text-[9.5px]">{label}</span>
      </div>
      <p
        className="metric-number mt-2 flex items-baseline gap-1 text-[19px] font-semibold leading-none text-ink"
        style={accent ? { color: accent } : undefined}
      >
        {value}
        {unit ? <span className="text-[9px] font-normal text-ink-faint">{unit}</span> : null}
      </p>
    </div>
  )
}

function PortRow({ port }: { port: DevicePort }) {
  const Icon = PORT_ICONS[port.kind] ?? Plug
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/[0.055] bg-white/[0.016] p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-white/[0.025] text-ink-faint">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11.5px] font-medium text-ink">{port.label}</p>
          <PortStatusBadge port={port} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-ink-faint">
          {port.speed ? <span className="font-mono">{port.speed}</span> : null}
          {port.note ? (
            <>
              <span>·</span>
              <span className={port.status === 'warning' ? 'text-amber-300/80' : undefined}>
                {port.note}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function DeviceDrawer() {
  const { t } = useTranslation()
  const open = useUiStore((state) => state.drawerOpen)
  const close = useUiStore((state) => state.closeDrawer)
  const setPage = useUiStore((state) => state.setPage)
  const selectedId = useDeviceStore((state) => state.selectedId)
  const device = useDeviceStore((state) =>
    state.devices.find((item) => item.id === state.selectedId),
  )
  const diagnostics = useDiagnostics()
  const language = useSettingsStore((state) => state.language)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    // 切换设备后回到概览页，避免停留在上一个设备选中的标签
    if (!selectedId) return
    setTab('overview')
  }, [selectedId])

  if (!device) return null

  const deviceDiagnostics = (diagnostics.data ?? []).filter(
    (diagnosis) => diagnosis.deviceId === device.id,
  )
  const warnings = deviceDiagnostics.filter((diagnosis) => diagnosis.severity !== 'info')

  const goTo = (page: 'viewer' | 'topology' | 'telemetry') => {
    close()
    setPage(page)
  }

  const metrics: Array<{
    label: string
    value: string | number
    unit?: string
    icon: typeof Gauge
  }> = []
  if (device.telemetry.pollingRate !== null && device.telemetry.pollingRate !== undefined) {
    metrics.push({
      label: t('telemetry.metric.pollingRate'),
      value: Math.round(device.telemetry.pollingRate),
      unit: 'Hz',
      icon: Gauge,
    })
  }
  if (device.telemetry.dpi !== null && device.telemetry.dpi !== undefined) {
    metrics.push({
      label: t('telemetry.metric.dpi'),
      value: Math.round(device.telemetry.dpi),
      unit: 'DPI',
      icon: Crosshair,
    })
  }
  if (device.telemetry.signal !== null && device.telemetry.signal !== undefined) {
    metrics.push({
      label: t('telemetry.metric.signal'),
      value: device.telemetry.signal,
      unit: 'dBm',
      icon: Signal,
    })
  }
  if (device.telemetry.temperature !== null && device.telemetry.temperature !== undefined) {
    metrics.push({
      label: t('telemetry.metric.temperature'),
      value: device.telemetry.temperature,
      unit: '°C',
      icon: Thermometer,
    })
  }
  if (device.telemetry.latency !== null && device.telemetry.latency !== undefined) {
    metrics.push({
      label: t('telemetry.metric.latency'),
      value: device.telemetry.latency,
      unit: 'ms',
      icon: Timer,
    })
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: t('drawer.tabs.overview') },
    { id: 'ports', label: t('drawer.tabs.ports') },
    { id: 'health', label: t('drawer.tabs.health') },
  ]

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => !value && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_180ms_ease-out]" />
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-[61] flex h-full w-[min(470px,100vw)] flex-col overflow-hidden border-l border-line bg-[#070a11] shadow-[-40px_0_100px_-30px_rgba(0,0,0,0.9)] outline-none data-[state=open]:animate-[sheet-in_300ms_cubic-bezier(0.22,1,0.36,1)]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{device.name}</DialogPrimitive.Title>

          <div
            className="relative shrink-0 overflow-hidden border-b border-line px-5 pb-4 pt-3"
            style={{
              background: `radial-gradient(120% 100% at 85% 0%, ${hexToRgba(device.accent, 0.16)}, rgba(7,10,17,0) 60%)`,
            }}
          >
            <div className="pointer-events-none absolute -right-4 top-2 w-[250px] opacity-55">
              <DeviceGlyph category={device.category} accent={device.accent} />
            </div>
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-ink-faint">
                  DEVICE / {shortId(device.id)}
                </span>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                  aria-label={t('drawer.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Badge variant="neutral" size="sm">
                  <CategoryIcon category={device.category} className="h-2.5 w-2.5" />
                  {t(`category.${device.category}`)}
                </Badge>
                <StatusBadge
                  status={device.status}
                  label={t(`status.${device.status}`)}
                  size="sm"
                />
                {device.battery !== null && device.battery !== undefined ? (
                  <span className="font-mono text-[9px] text-ink-faint">
                    {Math.round(device.battery)}% {device.charging ? '· CHG' : ''}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-2.5 max-w-[300px] text-[21px] font-semibold leading-tight tracking-[-0.025em] text-ink">
                {device.name}
              </h2>
              <p className="mt-1 text-[11px] text-ink-muted">{device.manufacturer}</p>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <ConnectionBadge connection={device.connection} />
                {device.firmware ? (
                  <Badge variant="outline" className="font-mono">
                    FW {device.firmware}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Box className="h-3.5 w-3.5" />}
                  onClick={() => goTo('viewer')}
                >
                  {t('drawer.open3d')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Network className="h-3.5 w-3.5" />}
                  onClick={() => goTo('topology')}
                >
                  {t('drawer.openTopology')}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 border-b border-line px-4 pt-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'relative px-3 py-2.5 text-[11px] font-medium transition-colors',
                  tab === item.id ? 'text-ink' : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                {item.label}
                {item.id === 'health' && warnings.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-amber-400/15 px-1 py-px font-mono text-[8px] text-amber-300">
                    {warnings.length}
                  </span>
                ) : null}
                {tab === item.id ? (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-accent" />
                ) : null}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[8.5px] text-ink-faint/70">
              <span className="live-dot scale-[0.65]" />
              {t('drawer.live')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin p-4">
            {tab === 'overview' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {device.battery !== null && device.battery !== undefined ? (
                    <div className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
                      <BatteryRing
                        value={device.battery}
                        charging={device.charging}
                        accent={device.accent}
                        size={44}
                      />
                      <div>
                        <p className="text-[9.5px] text-ink-faint">{t('drawer.batteryEstimate')}</p>
                        <p className="mt-0.5 font-mono text-[9px] text-ink-faint/70">
                          {device.charging ? t('connection.charging') : 'DISCHARGE'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <MetricTile
                      label={t('connection.battery')}
                      value={
                        device.batteryProbe?.status === 'uncalibrated'
                          ? t('connection.batteryPending')
                          : t('connection.noBattery')
                      }
                      icon={BatteryCharging}
                    />
                  )}
                  {metrics.slice(0, 3).map((metric) => (
                    <MetricTile key={metric.label} {...metric} />
                  ))}
                </div>

                {metrics.length === 0 &&
                (device.battery === null || device.battery === undefined) ? (
                  <div className="rounded-lg border border-white/[0.05] bg-white/[0.016] p-3 text-[10px] text-ink-faint">
                    {device.batteryProbe?.status === 'uncalibrated'
                      ? t('drawer.batteryProbePending', { vendor: device.batteryProbe.vendor })
                      : (device.batteryProbe?.reason ?? t('common.unavailable'))}
                  </div>
                ) : null}

                <section>
                  <h3 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                    {t('viewer.panel.specs')}
                  </h3>
                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.014] px-3 py-1">
                    <InfoRow label={t('connection.protocol')} value={device.connection.protocol} />
                    {device.connection.speed ? (
                      <InfoRow label={t('connection.speed')} value={device.connection.speed} mono />
                    ) : null}
                    {device.connection.receiver ? (
                      <InfoRow
                        label={t('connection.receiver')}
                        value={device.connection.receiver}
                      />
                    ) : null}
                    {device.connection.signalQuality !== undefined ? (
                      <InfoRow
                        label={t('connection.signalQuality')}
                        value={`${device.connection.signalQuality}% · ${device.telemetry.signal ?? '—'} dBm`}
                      />
                    ) : null}
                    <InfoRow label={t('connection.firmware')} value={device.firmware ?? '—'} mono />
                    <InfoRow
                      label={t('connection.serial')}
                      value={device.serial ?? t('connection.unidentified')}
                      mono
                    />
                    <InfoRow label={t('connection.location')} value={device.location ?? '—'} mono />
                    <InfoRow
                      label={t('connection.vidpid')}
                      value={`${device.vendorId.toString(16).toUpperCase().padStart(4, '0')} : ${device.productId
                        .toString(16)
                        .toUpperCase()
                        .padStart(4, '0')}`}
                      mono
                    />
                    {device.interfaceNumber !== null && device.interfaceNumber !== undefined ? (
                      <InfoRow
                        label={t('connection.interfaceNumber')}
                        value={`#${device.interfaceNumber}`}
                        mono
                      />
                    ) : null}
                    {device.usagePage !== null && device.usagePage !== undefined ? (
                      <InfoRow
                        label={t('connection.usage')}
                        value={`0x${device.usagePage.toString(16)} / 0x${(device.usage ?? 0)
                          .toString(16)
                          .padStart(2, '0')}`}
                        mono
                      />
                    ) : null}
                    <InfoRow label={t('connection.reconnect')} value={device.reconnectCount} mono />
                  </div>
                </section>

                {!device.serial ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-400/16 bg-amber-400/[0.045] p-2.5">
                    <Info className="mt-px h-3 w-3 shrink-0 text-amber-300/80" />
                    <p className="text-[9.5px] leading-relaxed text-amber-200/70">
                      {t('connection.noSerial')}
                    </p>
                  </div>
                ) : null}

                <section>
                  <h3 className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                    {t('connection.capabilities')}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {device.capabilities.length === 0 ? (
                      <span className="text-[10px] text-ink-faint">{t('common.unavailable')}</span>
                    ) : (
                      device.capabilities.map((capability) => (
                        <Badge key={capability} variant="neutral" className="font-mono">
                          {capability}
                        </Badge>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-white/[0.055] bg-white/[0.016] p-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-accent" strokeWidth={1.7} />
                    <h3 className="text-[10px] font-medium text-ink">
                      {t('viewer.panel.identification')}
                    </h3>
                    <Badge
                      variant={device.modelId ? 'success' : 'warning'}
                      size="sm"
                      className="ml-auto"
                    >
                      {device.modelId
                        ? t('connection.matchedExact')
                        : t('connection.matchedFallback')}
                    </Badge>
                  </div>
                  <div className="mt-2 border-t border-white/[0.05] pt-1">
                    <InfoRow
                      label={t('connection.model')}
                      value={device.modelId ?? 'generic-parametric'}
                      mono
                    />
                    <InfoRow label="DEVICE ID" value={device.id} mono />
                    <InfoRow
                      label={t('drawer.lastSeen')}
                      value={formatRelativeTime(device.lastSeen, language)}
                    />
                  </div>
                </section>

                {warnings.length > 0 ? (
                  <div className="space-y-2">
                    {warnings.map((diagnosis) => (
                      <DiagnosticCard key={diagnosis.id} diagnosis={diagnosis} compact />
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => goTo('telemetry')}
                  className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[10.5px] text-ink-muted transition-colors hover:border-[rgba(var(--accent-rgb),0.3)] hover:text-ink"
                >
                  {t('drawer.historyHint')}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            ) : null}

            {tab === 'ports' ? (
              <div className="space-y-4">
                <section>
                  <h3 className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                    {t('connection.ports')}
                  </h3>
                  <div className="space-y-2">
                    {device.ports.length > 0 ? (
                      device.ports.map((port) => <PortRow key={port.id} port={port} />)
                    ) : (
                      <p className="text-[10px] text-ink-faint">{t('drawer.noPorts')}</p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                    {t('connection.anchors')}
                    <span className="h-px flex-1 bg-white/[0.05]" />
                  </h3>
                  <div className="space-y-1.5">
                    {device.anchors.length === 0 ? (
                      <p className="text-[10px] text-ink-faint">{t('drawer.noPorts')}</p>
                    ) : (
                      device.anchors.map((anchor, index) => (
                        <div
                          key={anchor.id}
                          className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2"
                        >
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[8px]"
                            style={{
                              borderColor: hexToRgba(device.accent, 0.35),
                              color: device.accent,
                              background: hexToRgba(device.accent, 0.07),
                            }}
                          >
                            {index + 1}
                          </span>
                          <span className="text-[10.5px] text-ink">{anchor.label}</span>
                          <Badge
                            variant="outline"
                            size="sm"
                            className="ml-auto font-mono uppercase"
                          >
                            {anchor.kind}
                          </Badge>
                          <span className="font-mono text-[8.5px] text-ink-faint/70">
                            {anchor.position.map((value) => value.toFixed(3)).join(', ')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.016] p-2.5">
                    <MapPin className="mt-px h-3 w-3 shrink-0 text-ink-faint" />
                    <p className="text-[9.5px] leading-relaxed text-ink-faint">
                      {t('viewer.panel.anchorsHint')}
                    </p>
                  </div>
                </section>
              </div>
            ) : null}

            {tab === 'health' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.016] p-3">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg border',
                      warnings.length > 0
                        ? 'border-amber-400/20 bg-amber-400/8 text-amber-300'
                        : 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300',
                    )}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium text-ink">
                      {warnings.length > 0 ? t('drawer.statusWarning') : t('drawer.statusOk')}
                    </p>
                    <p className="text-[9.5px] text-ink-faint">
                      {t('drawer.diagnosisCount', { count: deviceDiagnostics.length })} ·{' '}
                      {formatRelativeTime(device.lastSeen, language)}
                    </p>
                  </div>
                </div>

                {deviceDiagnostics.length > 0 ? (
                  deviceDiagnostics.map((diagnosis) => (
                    <DiagnosticCard key={diagnosis.id} diagnosis={diagnosis} />
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-400/12 bg-emerald-400/[0.03] py-8 text-center">
                    <ShieldCheck className="h-6 w-6 text-emerald-400/70" strokeWidth={1.5} />
                    <p className="text-[11px] text-ink-muted">{t('drawer.noDiagnostics')}</p>
                  </div>
                )}

                <div className="rounded-xl border border-white/[0.05] bg-white/[0.016] p-3">
                  <div className="flex items-center gap-2">
                    <Timer className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.7} />
                    <p className="text-[10px] text-ink-muted">{t('telemetry.sampling.rate')}</p>
                  </div>
                  <div className="mt-2 space-y-1.5 border-t border-white/[0.05] pt-2">
                    <InfoRow label={t('telemetry.sampling.ui')} value="10 Hz" mono />
                    <InfoRow
                      label={t('telemetry.sampling.persist')}
                      value={t('telemetry.sampling.oneHz')}
                      mono
                    />
                    <InfoRow
                      label={t('telemetry.sampling.retention')}
                      value={t('telemetry.sampling.sevenDays')}
                      mono
                    />
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  onClick={() => goTo('telemetry')}
                >
                  {t('telemetry.title')}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-line bg-white/[0.01] px-4 py-2.5">
            <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-wider text-ink-faint/70">
              <Hash className="h-2.5 w-2.5" />
              {shortId(device.id)}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-wider text-ink-faint/60">
              READ-ONLY · USER SPACE
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
