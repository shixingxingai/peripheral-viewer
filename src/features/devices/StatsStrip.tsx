import { BatteryCharging, Boxes, CircleDot, type LucideIcon, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { cn } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import type { DeviceCategory, DeviceSnapshot } from '@/types/device'

function StatShell({
  icon: Icon,
  label,
  children,
  footer,
  tone = 'default',
  onClick,
  className,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
  footer: React.ReactNode
  tone?: 'default' | 'warning'
  onClick?: () => void
  className?: string
}) {
  const Element = onClick ? 'button' : 'div'
  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'panel group relative flex flex-col overflow-hidden p-3.5 text-left',
        onClick && 'panel-hover cursor-pointer',
        tone === 'warning' && 'border-amber-400/14',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full opacity-[0.14] blur-2xl transition-opacity duration-300 group-hover:opacity-25',
          tone === 'warning' ? 'bg-amber-400' : 'bg-accent',
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-ink-faint">{label}</span>
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md border',
            tone === 'warning'
              ? 'border-amber-400/20 bg-amber-400/8 text-amber-300'
              : 'border-line bg-white/[0.025] text-ink-faint',
          )}
        >
          <Icon className="h-3 w-3" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-2">{children}</div>
      <div className="mt-2.5">{footer}</div>
    </Element>
  )
}

export function StatsStrip({ devices }: { devices: DeviceSnapshot[] }) {
  const { t } = useTranslation()
  const setStatus = useDeviceStore((state) => state.setStatus)
  const setCategory = useDeviceStore((state) => state.setCategory)

  const online = devices.filter((device) => device.status !== 'offline').length
  const warnings = devices.filter((device) => device.status === 'warning').length
  const offline = devices.length - online
  const batteryDevices = devices.filter(
    (device) => device.battery !== null && device.battery !== undefined,
  )
  const avgBattery =
    batteryDevices.length > 0
      ? Math.round(
          batteryDevices.reduce((sum, device) => sum + (device.battery ?? 0), 0) /
            batteryDevices.length,
        )
      : null

  const categories = [...new Set(devices.map((device) => device.category))] as DeviceCategory[]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatShell
        icon={Boxes}
        label={t('overview.stats.total')}
        footer={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {categories.slice(0, 7).map((category) => (
                <span
                  key={category}
                  className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-line bg-white/[0.02] text-ink-faint"
                >
                  <CategoryIcon category={category} className="h-2.5 w-2.5" />
                </span>
              ))}
            </div>
            <span className="font-mono text-[9px] text-ink-faint">
              {categories.length} {t('overview.stats.categories')}
            </span>
          </div>
        }
      >
        <span className="metric-number text-[28px] font-semibold leading-none text-ink">
          {devices.length}
        </span>
        <span className="mb-0.5 text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          DEVICES
        </span>
      </StatShell>

      <StatShell
        icon={CircleDot}
        label={t('overview.stats.online')}
        footer={
          <div>
            <div className="flex h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <span
                className="h-full bg-emerald-400/80"
                style={{ width: `${(online / Math.max(1, devices.length)) * 100}%` }}
              />
              <span
                className="h-full bg-amber-400/80"
                style={{ width: `${(warnings / Math.max(1, devices.length)) * 100}%` }}
              />
              <span
                className="h-full bg-slate-500/60"
                style={{ width: `${(offline / Math.max(1, devices.length)) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-ink-faint">
              <span className="text-emerald-400/80">{online} ONLINE</span>
              <span>{offline} OFFLINE</span>
            </div>
          </div>
        }
      >
        <span className="metric-number text-[28px] font-semibold leading-none text-ink">
          {online}
        </span>
        <span className="mb-0.5 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
      </StatShell>

      <StatShell
        icon={ShieldAlert}
        label={t('overview.stats.warnings')}
        tone="warning"
        onClick={() => {
          setCategory('all')
          setStatus('warning')
        }}
        footer={
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-amber-300/70">
              {warnings > 0 ? `${warnings} ${t('statusbar.warnings')}` : t('drawer.noDiagnostics')}
            </span>
            <span className="font-mono text-[9px] text-ink-faint">VIEW →</span>
          </div>
        }
      >
        <span className="metric-number text-[28px] font-semibold leading-none text-amber-300">
          {warnings}
        </span>
        <span className="mb-0.5 text-[9px] uppercase tracking-[0.16em] text-amber-300/50">
          ALERTS
        </span>
      </StatShell>

      <StatShell
        icon={BatteryCharging}
        label={t('overview.stats.avgBattery')}
        footer={
          <div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400/80 to-[var(--accent)] transition-[width] duration-700"
                style={{ width: `${avgBattery ?? 0}%` }}
              />
            </div>
            <p className="mt-1.5 font-mono text-[9px] text-ink-faint">
              {batteryDevices.length} BATTERY-POWERED
            </p>
          </div>
        }
      >
        <span className="metric-number text-[28px] font-semibold leading-none text-ink">
          {avgBattery ?? '—'}
          {avgBattery !== null ? <span className="text-[13px] text-ink-faint">%</span> : null}
        </span>
      </StatShell>
    </div>
  )
}
