import { AlertTriangle, ArrowUpRight, Gauge, Signal, Thermometer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BatteryRing } from '@/components/common/BatteryRing'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ConnectionBadge, StatusBadge } from '@/components/common/ConnectionBadge'
import { DeviceGlyph } from '@/components/common/DeviceGlyph'
import { Badge } from '@/components/ui/badge'
import { cn, hexToRgba } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useUiStore } from '@/stores/ui'
import type { DeviceSnapshot } from '@/types/device'

export function DeviceCard({ device, index }: { device: DeviceSnapshot; index: number }) {
  const { t } = useTranslation()
  const openDevice = useUiStore((state) => state.openDevice)
  const selectedId = useDeviceStore((state) => state.selectedId)
  const selected = selectedId === device.id

  const metrics: Array<{ label: string; value: string; icon?: React.ReactNode }> = []
  if (device.telemetry.pollingRate !== null && device.telemetry.pollingRate !== undefined) {
    metrics.push({
      label: 'Hz',
      value: `${Math.round(device.telemetry.pollingRate)}`,
      icon: <Gauge className="h-3 w-3" />,
    })
  }
  if (device.telemetry.signal !== null && device.telemetry.signal !== undefined) {
    metrics.push({
      label: 'dBm',
      value: `${device.telemetry.signal}`,
      icon: <Signal className="h-3 w-3" />,
    })
  }
  if (device.telemetry.temperature !== null && device.telemetry.temperature !== undefined) {
    metrics.push({
      label: '°C',
      value: `${device.telemetry.temperature}`,
      icon: <Thermometer className="h-3 w-3" />,
    })
  }

  return (
    <button
      type="button"
      onClick={() => openDevice(device.id)}
      style={{ animationDelay: `${Math.min(index, 9) * 32}ms` }}
      className={cn(
        'panel panel-hover group relative flex flex-col overflow-hidden text-left animate-[card-in_420ms_cubic-bezier(0.22,1,0.36,1)_both]',
        selected && 'border-[rgba(var(--accent-rgb),0.38)] accent-glow',
      )}
      aria-label={`${device.name} — ${t('overview.card.view')}`}
    >
      <div
        className="relative h-[172px] overflow-hidden border-b border-white/[0.045]"
        style={{
          background: `radial-gradient(120% 120% at 50% 0%, ${hexToRgba(device.accent, 0.13)} 0%, rgba(7,10,17,0.1) 58%, rgba(7,10,17,0) 100%)`,
        }}
      >
        <div className="absolute inset-0 grid-surface opacity-[0.32]" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[130px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-55"
          style={{ background: device.accent }}
        />
        <div className="absolute inset-0 flex items-center justify-center px-8 pt-2">
          <DeviceGlyph
            category={device.category}
            accent={device.accent}
            className="max-w-[230px] transition-transform duration-500 ease-out group-hover:scale-[1.035]"
          />
        </div>

        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
          <Badge variant="neutral" size="sm" className="bg-black/30 backdrop-blur-md">
            <CategoryIcon category={device.category} className="h-2.5 w-2.5" />
            {t(`category.${device.category}`)}
          </Badge>
          {device.status === 'warning' ? (
            <Badge variant="warning" size="sm" className="bg-black/30 backdrop-blur-md">
              <AlertTriangle className="h-2.5 w-2.5" />
              {t('status.warning')}
            </Badge>
          ) : null}
        </div>

        <div className="absolute right-3.5 top-3.5 flex items-center gap-1.5">
          <StatusBadge
            status={device.status}
            label={t(`status.${device.status}`)}
            className="bg-black/30 backdrop-blur-md"
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3.5 pb-2.5">
          <span className="flex items-center gap-1.5">
            {device.connection.kind === 'wireless' || device.connection.kind === 'bluetooth' ? (
              <span className="live-dot scale-75" />
            ) : (
              <span className="h-1 w-1 rounded-full bg-emerald-400/80" />
            )}
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">
              {device.connection.protocol}
            </span>
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.07] bg-black/30 text-ink-faint opacity-0 backdrop-blur-md transition-all duration-200 group-hover:border-[rgba(var(--accent-rgb),0.3)] group-hover:text-accent group-hover:opacity-100">
            <ArrowUpRight className="h-3 w-3" />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              {device.manufacturer}
            </p>
            <h3 className="mt-1 truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              {device.name}
            </h3>
          </div>
          {device.battery !== null && device.battery !== undefined ? (
            <BatteryRing
              value={device.battery}
              charging={device.charging}
              accent={device.accent}
              size={38}
            />
          ) : (
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line bg-white/[0.02] text-ink-faint">
              <CategoryIcon category={device.category} className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <ConnectionBadge connection={device.connection} />
          {device.rgb?.enabled ? (
            <Badge variant="outline" className="gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: device.rgb.color, boxShadow: `0 0 6px ${device.rgb.color}` }}
              />
              RGB
            </Badge>
          ) : null}
          {device.reconnectCount > 0 ? (
            <Badge variant="warning">
              {device.reconnectCount} {t('overview.card.reconnects')}
            </Badge>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-3 border-t border-white/[0.05] pt-3">
          {metrics.slice(0, 2).map((metric) => (
            <span key={metric.label} className="flex items-center gap-1.5 text-ink-faint">
              {metric.icon}
              <span className="metric-number text-[11.5px] font-semibold text-ink-muted">
                {metric.value}
              </span>
              <span className="text-[8.5px]">{metric.label}</span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-wide text-ink-faint/70">
            {device.modelId ? t('connection.matchedExact') : t('connection.matchedFallback')}
            <span
              className={cn(
                'h-1 w-1 rounded-full',
                device.modelId ? 'bg-emerald-400/70' : 'bg-amber-400/70',
              )}
            />
          </span>
        </div>
      </div>
    </button>
  )
}
