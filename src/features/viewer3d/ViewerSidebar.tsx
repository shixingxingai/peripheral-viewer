import {
  Anchor,
  ArrowUpRight,
  Cable,
  Cpu,
  Crosshair,
  Gauge,
  Info,
  Radio,
  ShieldCheck,
  Signal,
  Sparkles,
  Thermometer,
  Timer,
  Usb,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BatteryRing } from '@/components/common/BatteryRing'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ConnectionBadge, StatusBadge } from '@/components/common/ConnectionBadge'
import { DeviceGlyph } from '@/components/common/DeviceGlyph'
import { DiagnosticCard } from '@/components/common/DiagnosticCard'
import { InfoRow } from '@/components/common/InfoRow'
import { Badge } from '@/components/ui/badge'
import { useDiagnostics } from '@/hooks/useDeviceData'
import { cn, formatRelativeTime, hexToRgba, shortId } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { DeviceSnapshot } from '@/types/device'

function Metric({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: typeof Gauge
  label: string
  value: string | number
  unit?: string
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.016] px-2.5 py-2">
      <div className="flex items-center gap-1 text-ink-faint">
        <Icon className="h-2.5 w-2.5" strokeWidth={1.8} />
        <span className="text-[9px]">{label}</span>
      </div>
      <p className="metric-number mt-1 flex items-baseline gap-0.5 text-[15px] font-semibold leading-none text-ink">
        {value}
        {unit ? <span className="text-[8px] font-normal text-ink-faint">{unit}</span> : null}
      </p>
    </div>
  )
}

export function ViewerSidebar({
  device,
  activeAnchorId,
  onAnchorSelect,
}: {
  device: DeviceSnapshot
  activeAnchorId: string | null
  onAnchorSelect: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const language = useSettingsStore((state) => state.language)
  const openDevice = useUiStore((state) => state.openDevice)
  const setPage = useUiStore((state) => state.setPage)

  const deviceDiagnostics = (diagnostics.data ?? []).filter(
    (diagnosis) => diagnosis.deviceId === device.id,
  )
  const cablePort = device.anchors.find((anchor) => anchor.kind === 'port')
  const isWireless = device.connection.kind === 'wireless' || device.connection.kind === 'bluetooth'

  return (
    <div className="flex flex-col gap-3">
      <section className="panel relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-28 opacity-80"
          style={{
            background: `radial-gradient(120% 100% at 85% 0%, ${hexToRgba(device.accent, 0.18)}, transparent 65%)`,
          }}
        />
        <div className="pointer-events-none absolute -right-5 -top-4 w-[170px] opacity-60">
          <DeviceGlyph category={device.category} accent={device.accent} />
        </div>
        <div className="relative p-4">
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral" size="sm">
              <CategoryIcon category={device.category} className="h-2.5 w-2.5" />
              {t(`category.${device.category}`)}
            </Badge>
            <StatusBadge status={device.status} label={t(`status.${device.status}`)} size="sm" />
          </div>
          <h2 className="mt-2 max-w-[220px] text-[16px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {device.name}
          </h2>
          <p className="mt-0.5 text-[10px] text-ink-muted">{device.manufacturer}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ConnectionBadge connection={device.connection} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.016] px-2.5 py-2">
              {device.battery !== null && device.battery !== undefined ? (
                <>
                  <BatteryRing
                    value={device.battery}
                    charging={device.charging}
                    accent={device.accent}
                    size={34}
                  />
                  <div>
                    <p className="text-[9px] text-ink-faint">{t('connection.battery')}</p>
                    <p className="font-mono text-[8.5px] text-ink-faint/70">
                      {device.charging ? t('connection.charging') : 'DISCHARGE'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-faint">
                    <Usb className="h-3.5 w-3.5" strokeWidth={1.7} />
                  </span>
                  <div>
                    <p className="text-[9px] text-ink-faint">{t('connection.battery')}</p>
                    <p className="text-[9px] text-ink-muted">{t('connection.noBattery')}</p>
                  </div>
                </>
              )}
            </div>
            {device.telemetry.pollingRate !== null && device.telemetry.pollingRate !== undefined ? (
              <Metric
                icon={Gauge}
                label={t('telemetry.metric.pollingRate')}
                value={Math.round(device.telemetry.pollingRate)}
                unit="Hz"
              />
            ) : null}
            {device.telemetry.dpi !== null && device.telemetry.dpi !== undefined ? (
              <Metric
                icon={Crosshair}
                label={t('telemetry.metric.dpi')}
                value={Math.round(device.telemetry.dpi)}
                unit="DPI"
              />
            ) : null}
            {device.telemetry.signal !== null && device.telemetry.signal !== undefined ? (
              <Metric
                icon={Signal}
                label={t('telemetry.metric.signal')}
                value={device.telemetry.signal}
                unit="dBm"
              />
            ) : null}
            {device.telemetry.latency !== null && device.telemetry.latency !== undefined ? (
              <Metric
                icon={Timer}
                label={t('telemetry.metric.latency')}
                value={device.telemetry.latency}
                unit="ms"
              />
            ) : null}
            {device.telemetry.temperature !== null && device.telemetry.temperature !== undefined ? (
              <Metric
                icon={Thermometer}
                label={t('telemetry.metric.temperature')}
                value={device.telemetry.temperature}
                unit="°C"
              />
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => openDevice(device.id)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-line px-2.5 py-2 text-[10px] text-ink-muted transition-colors hover:border-[rgba(var(--accent-rgb),0.3)] hover:text-ink"
          >
            {t('overview.card.view')}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </section>

      <section className="panel p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <Anchor className="h-3 w-3 text-accent" strokeWidth={1.8} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {t('connection.anchors')}
          </h3>
          <span className="ml-auto font-mono text-[8.5px] text-ink-faint/70">
            {device.anchors.length} POINTS
          </span>
        </div>
        <div className="space-y-1">
          {device.anchors.map((anchor) => {
            const active = activeAnchorId === anchor.id
            const Icon = anchor.kind === 'rgb' ? Sparkles : anchor.kind === 'feature' ? Cpu : Usb
            return (
              <button
                key={anchor.id}
                type="button"
                onClick={() => onAnchorSelect(active ? null : anchor.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                  active
                    ? 'border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.07)]'
                    : 'border-transparent hover:border-line hover:bg-white/[0.025]',
                )}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                  style={{
                    borderColor: hexToRgba(device.accent, active ? 0.45 : 0.16),
                    background: hexToRgba(device.accent, active ? 0.14 : 0.045),
                    color: device.accent,
                  }}
                >
                  <Icon className="h-2.5 w-2.5" strokeWidth={1.8} />
                </span>
                <span className="flex-1 truncate text-[10px] text-ink-muted">{anchor.label}</span>
                <span className="font-mono text-[8px] uppercase text-ink-faint/60">
                  {anchor.kind}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[8.5px] leading-relaxed text-ink-faint/70">
          <Info className="mt-px h-2.5 w-2.5 shrink-0" />
          {t('viewer.panel.anchorsHint')}
        </p>
      </section>

      <section className="panel p-3.5">
        <div className="mb-2 flex items-center gap-2">
          {isWireless ? (
            <Radio className="h-3 w-3 text-accent" strokeWidth={1.8} />
          ) : (
            <Cable className="h-3 w-3 text-accent" strokeWidth={1.8} />
          )}
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {t('viewer.panel.cable')}
          </h3>
        </div>
        {isWireless ? (
          <div className="space-y-1.5">
            <InfoRow label={t('connection.receiver')} value={device.connection.receiver ?? '—'} />
            <InfoRow
              label={t('connection.signalQuality')}
              value={`${device.connection.signalQuality ?? '—'}% · ${device.telemetry.signal ?? '—'} dBm`}
            />
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${device.connection.signalQuality ?? 0}%`,
                  background: `linear-gradient(90deg, ${hexToRgba(device.accent, 0.45)}, ${device.accent})`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <InfoRow label={t('connection.protocol')} value={device.connection.protocol} />
            <InfoRow label={t('connection.ports')} value={cablePort?.label ?? '—'} />
            <InfoRow label={t('viewer.panel.cableTarget')} value={device.location ?? '—'} mono />
            <p className="pt-1 font-mono text-[8.5px] uppercase tracking-wide text-ink-faint/60">
              {device.connection.speed ?? 'USB'} · READ-ONLY
            </p>
          </div>
        )}
      </section>

      <section className="panel p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <Cpu className="h-3 w-3 text-accent" strokeWidth={1.8} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {t('viewer.panel.identification')}
          </h3>
          <Badge variant={device.modelId ? 'success' : 'warning'} size="sm" className="ml-auto">
            {device.modelId ? t('connection.matchedExact') : t('connection.matchedFallback')}
          </Badge>
        </div>
        <InfoRow
          label={t('viewer.activeModel')}
          value={device.modelId ?? 'generic-parametric'}
          mono
        />
        <InfoRow label={t('connection.firmware')} value={device.firmware ?? '—'} mono />
        <InfoRow label="DEVICE ID" value={shortId(device.id)} mono />
        <InfoRow
          label={t('drawer.lastSeen')}
          value={formatRelativeTime(device.lastSeen, language)}
        />
        <p className="mt-2 rounded-md border border-white/[0.05] bg-white/[0.016] p-2 text-[8.5px] leading-relaxed text-ink-faint">
          {device.modelId ? t('viewer.modelExact') : t('viewer.modelFallback')}
        </p>
      </section>

      <section className="panel p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-3 w-3 text-accent" strokeWidth={1.8} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {t('viewer.panel.diagnostics')}
          </h3>
          <span className="ml-auto font-mono text-[8.5px] text-ink-faint/70">
            {deviceDiagnostics.length}
          </span>
        </div>
        {deviceDiagnostics.length > 0 ? (
          <div className="space-y-2">
            {deviceDiagnostics.slice(0, 3).map((diagnosis) => (
              <DiagnosticCard key={diagnosis.id} diagnosis={diagnosis} compact />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-400/12 bg-emerald-400/[0.03] px-2.5 py-2 text-[9.5px] text-emerald-300/80">
            <ShieldCheck className="h-3 w-3" strokeWidth={1.8} />
            {t('viewer.noDiagnostics')}
          </p>
        )}
        <button
          type="button"
          onClick={() => setPage('telemetry')}
          className="mt-2 flex w-full items-center justify-between rounded-md px-1 py-1 text-[9px] text-ink-faint transition-colors hover:text-accent"
        >
          {t('telemetry.title')}
          <ArrowUpRight className="h-2.5 w-2.5" />
        </button>
      </section>

      <p className="px-1 pb-2 text-center font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint/35">
        MODEL BUILT PROCEDURALLY · ANCHORS FROM CATALOG
      </p>
    </div>
  )
}
