import {
  Activity,
  AlertTriangle,
  Bell,
  Box,
  ChevronRight,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  type LucideIcon,
  Network,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { useDataSource } from '@/hooks/useDataSource'
import { useDiagnostics, useHotplugSimulation } from '@/hooks/useDeviceData'
import { backend } from '@/lib/backend'
import {
  canSimulateHotplug,
  DATA_SOURCE_DETAIL_KEY,
  DATA_SOURCE_LABEL_KEY,
} from '@/lib/dataSourceText'
import { changeLanguage } from '@/lib/i18n'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { PageId } from '@/types/device'

const PAGE_ICONS: Record<PageId, LucideIcon> = {
  overview: LayoutDashboard,
  viewer: Box,
  topology: Network,
  telemetry: Activity,
  layout: LayoutTemplate,
  settings: Settings,
}

export function Topbar({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation()
  const { source } = useDataSource()
  const page = useUiStore((state) => state.page)
  const setPage = useUiStore((state) => state.setPage)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const devices = useDeviceStore((state) => state.devices)
  const syncing = useDeviceStore((state) => state.syncing)
  const language = useSettingsStore((state) => state.language)
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const diagnostics = useDiagnostics()
  const simulateHotplug = useHotplugSimulation()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const PageIcon = PAGE_ICONS[page]
  const warningDiagnostics = (diagnostics.data ?? []).filter(
    (item) => item.severity === 'warning' || item.severity === 'critical',
  )
  const online = devices.filter((device) => device.status !== 'offline').length

  useEffect(() => {
    if (!notificationsOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [notificationsOpen])

  const toggleLanguage = () => {
    const next = language === 'zh' ? 'en' : 'zh'
    setLanguage(next)
    void changeLanguage(next)
    i18n.changeLanguage(next)
  }

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-[#060910]/66 px-4 backdrop-blur-xl xl:px-6">
      <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
        <span className="text-[11px] text-ink-faint">{t('nav.workspace')}</span>
        <ChevronRight className="h-3 w-3 text-ink-faint/60" />
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted">
          <PageIcon className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
          {t(`nav.${page}`)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="group flex h-9 w-full max-w-[330px] items-center gap-2.5 rounded-lg border border-line bg-white/[0.022] px-3 text-left transition-colors hover:border-line-strong hover:bg-white/[0.04]"
      >
        <Search
          className="h-3.5 w-3.5 text-ink-faint group-hover:text-ink-muted"
          strokeWidth={1.8}
        />
        <span className="flex-1 truncate text-[11.5px] text-ink-faint group-hover:text-ink-muted">
          {t('topbar.search')}
        </span>
        <span className="flex items-center gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip content={t(DATA_SOURCE_DETAIL_KEY[source])}>
          <Badge
            variant={source === 'demo' ? 'warning' : 'success'}
            size="lg"
            className="hidden h-8 gap-1.5 px-2.5 sm:inline-flex"
          >
            <span
              className={cn(
                'h-1 w-1 rounded-full',
                source === 'demo' ? 'bg-amber-400' : 'bg-emerald-400',
              )}
            />
            {t(DATA_SOURCE_LABEL_KEY[source])}
          </Badge>
        </Tooltip>

        {canSimulateHotplug(source) && backend.simulateHotplug ? (
          <Tooltip content={t('common.simulate')}>
            <button
              type="button"
              onClick={() => void simulateHotplug()}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink"
              aria-label={t('common.simulate')}
            >
              <PlugZap className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </Tooltip>
        ) : null}

        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((value) => !value)}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.05]',
              notificationsOpen ? 'bg-white/[0.06] text-ink' : 'text-ink-faint hover:text-ink',
            )}
            aria-label={t('topbar.notifications')}
            aria-expanded={notificationsOpen}
          >
            <Bell className="h-4 w-4" strokeWidth={1.7} />
            {warningDiagnostics.length > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[8px] font-bold text-[#1a1205]">
                {warningDiagnostics.length}
              </span>
            ) : (
              <span className="absolute right-2 top-2 h-1 w-1 rounded-full bg-emerald-400" />
            )}
          </button>

          {notificationsOpen && (
            <div className="panel absolute right-0 top-[calc(100%+10px)] z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
              <div className="flex items-center justify-between border-b border-white/[0.055] px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold text-ink">{t('topbar.notifications')}</p>
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    {t('drawer.diagnosisCount', { count: diagnostics.data?.length ?? 0 })}
                  </p>
                </div>
                <ShieldCheck className="h-4 w-4 text-ink-faint" strokeWidth={1.6} />
              </div>
              <div className="max-h-[320px] overflow-y-auto scroll-thin p-1.5">
                {(diagnostics.data ?? []).slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                        item.severity === 'warning' || item.severity === 'critical'
                          ? 'border-amber-400/20 bg-amber-400/8 text-amber-300'
                          : 'border-line bg-white/[0.03] text-ink-faint',
                      )}
                    >
                      <AlertTriangle className="h-3 w-3" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium text-ink">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-ink-faint">
                        {item.detail}
                      </p>
                      <p className="mt-1 font-mono text-[9px] text-ink-faint/70">
                        {formatRelativeTime(item.createdAt, language)}
                      </p>
                    </div>
                  </div>
                ))}
                {warningDiagnostics.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <ShieldCheck className="h-6 w-6 text-emerald-400/70" strokeWidth={1.5} />
                    <p className="text-[11px] text-ink-muted">{t('drawer.noDiagnostics')}</p>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false)
                  setPage('telemetry')
                }}
                className="flex w-full items-center justify-center gap-1 border-t border-white/[0.055] py-2.5 text-[10.5px] font-medium text-ink-muted transition-colors hover:bg-white/[0.03] hover:text-ink"
              >
                {t('telemetry.insights.open')}
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <Tooltip content={t('topbar.language')}>
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink"
            aria-label={t('topbar.language')}
          >
            <Languages className="h-4 w-4" strokeWidth={1.7} />
            {language === 'zh' ? '中' : 'EN'}
          </button>
        </Tooltip>

        <Tooltip content={t('topbar.refresh')}>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={syncing}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink disabled:opacity-50"
            aria-label={t('topbar.refresh')}
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} strokeWidth={1.7} />
          </button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-line" />
        <span className="hidden items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-ink-faint md:flex">
          <span className="h-1 w-1 rounded-full bg-emerald-400" />
          {online}/{devices.length}
        </span>
      </div>
    </header>
  )
}
