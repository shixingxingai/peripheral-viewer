import {
  Activity,
  Box,
  LayoutDashboard,
  LayoutTemplate,
  type LucideIcon,
  Network,
  Settings,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '@/components/common/Logo'
import { Kbd } from '@/components/ui/kbd'
import { useDataSource } from '@/hooks/useDataSource'
import { DATA_SOURCE_LABEL_KEY, DATA_SOURCE_SAMPLING } from '@/lib/dataSourceText'
import { cn } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useUiStore } from '@/stores/ui'
import type { PageId } from '@/types/device'

const WORKSPACE: Array<{ id: PageId; icon: LucideIcon; shortcut: string }> = [
  { id: 'overview', icon: LayoutDashboard, shortcut: '1' },
  { id: 'viewer', icon: Box, shortcut: '2' },
  { id: 'topology', icon: Network, shortcut: '3' },
  { id: 'telemetry', icon: Activity, shortcut: '4' },
  { id: 'layout', icon: LayoutTemplate, shortcut: '5' },
]

const SYSTEM: Array<{ id: PageId; icon: LucideIcon; shortcut: string }> = [
  { id: 'settings', icon: Settings, shortcut: '6' },
]

export function Sidebar() {
  const { t } = useTranslation()
  const { source } = useDataSource()
  const page = useUiStore((state) => state.page)
  const setPage = useUiStore((state) => state.setPage)
  const devices = useDeviceStore((state) => state.devices)

  const warnings = devices.filter((device) => device.status === 'warning').length
  const online = devices.filter((device) => device.status !== 'offline').length

  const renderItem = (item: { id: PageId; icon: LucideIcon; shortcut: string }) => {
    const Icon = item.icon
    const active = page === item.id
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setPage(item.id)}
        className={cn(
          'group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] transition-colors duration-150',
          active ? 'text-ink' : 'text-ink-muted hover:bg-white/[0.035] hover:text-ink',
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-lg border border-[rgba(var(--accent-rgb),0.16)] bg-[linear-gradient(90deg,rgba(var(--accent-rgb),0.13),rgba(var(--accent-rgb),0.035))]"
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
          />
        )}
        {active && (
          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.7)]" />
        )}
        <Icon
          className={cn(
            'relative z-10 h-[15px] w-[15px] transition-colors',
            active ? 'text-accent' : 'text-ink-faint group-hover:text-ink-muted',
          )}
          strokeWidth={active ? 2 : 1.7}
        />
        <span className="relative z-10 flex-1 truncate">{t(`nav.${item.id}`)}</span>
        {item.id === 'overview' && devices.length > 0 ? (
          <span
            className={cn(
              'relative z-10 rounded-full border px-1.5 py-px font-mono text-[9px] tabular-nums',
              warnings > 0
                ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
                : 'border-line bg-white/[0.03] text-ink-faint',
            )}
          >
            {warnings > 0 ? warnings : devices.length}
          </span>
        ) : (
          <Kbd className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100">
            {item.shortcut}
          </Kbd>
        )}
      </button>
    )
  }

  return (
    <aside className="relative z-20 hidden w-[224px] shrink-0 flex-col border-r border-line bg-[#060910]/72 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/[0.045] px-4">
        <LogoMark size={34} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
            {t('app.name')}
          </p>
          <p className="text-[8px] font-semibold uppercase tracking-[0.28em] text-ink-faint">
            {t('app.tagline')}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 py-4">
        <p className="mb-2 px-2 text-[8.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint/80">
          {t('nav.workspace')}
        </p>
        <div className="space-y-0.5">{WORKSPACE.map(renderItem)}</div>

        <p className="mb-2 mt-6 px-2 text-[8.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint/80">
          {t('nav.system')}
        </p>
        <div className="space-y-0.5">{SYSTEM.map(renderItem)}</div>
      </nav>

      <div className="p-3">
        <div className="relative overflow-hidden rounded-xl border border-line bg-white/[0.018] p-3">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-25 blur-2xl"
            style={{ background: 'var(--accent)' }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Device layer
            </span>
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                  source === 'demo' ? 'bg-amber-400' : 'bg-emerald-400',
                )}
              />
              <span
                className={cn(
                  'relative inline-flex h-1.5 w-1.5 rounded-full',
                  source === 'demo' ? 'bg-amber-400' : 'bg-emerald-400',
                )}
              />
            </span>
          </div>
          <p className="mt-2 text-[11.5px] font-medium text-ink">
            {t(DATA_SOURCE_LABEL_KEY[source])}
          </p>
          <div className="mt-2.5 flex items-center gap-3 text-[10px] text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              {online} {t('common.online')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1 w-1 rounded-full',
                  warnings > 0 ? 'bg-amber-400' : 'bg-ink-faint',
                )}
              />
              {warnings} {t('status.warning')}
            </span>
          </div>
          <div className="mt-2.5 h-px bg-white/[0.06]" />
          <p className="mt-2 font-mono text-[9px] tracking-wide text-ink-faint/80">
            {DATA_SOURCE_SAMPLING[source]}
          </p>
        </div>
        <p className="mt-3 px-1 text-center font-mono text-[8.5px] tracking-[0.08em] text-ink-faint/50">
          {t('app.version')} · LOCAL-FIRST
        </p>
      </div>
    </aside>
  )
}
