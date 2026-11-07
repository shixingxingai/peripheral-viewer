import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDataSource } from '@/hooks/useDataSource'
import { DATA_SOURCE_SAMPLING, DATA_SOURCE_SHORT } from '@/lib/dataSourceText'
import { cn, formatClock } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'

export function StatusBar() {
  const { t } = useTranslation()
  const { source } = useDataSource()
  const devices = useDeviceStore((state) => state.devices)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const online = devices.filter((device) => device.status !== 'offline').length
  const warnings = devices.filter((device) => device.status === 'warning').length

  return (
    <footer className="relative z-20 flex h-7 shrink-0 items-center gap-4 border-t border-line bg-[#05070c]/80 px-4 font-mono text-[9px] tracking-[0.04em] text-ink-faint backdrop-blur-xl">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-1 w-1 rounded-full',
            source === 'demo' ? 'bg-amber-400' : 'bg-emerald-400',
          )}
        />
        {DATA_SOURCE_SHORT[source]}
      </span>
      <span className="hidden sm:inline">
        {online} {t('statusbar.online')}
      </span>
      <span className={cn(warnings > 0 && 'text-amber-300/80')}>
        {warnings} {t('statusbar.warnings')}
      </span>
      <span className="ml-auto hidden md:inline">{DATA_SOURCE_SAMPLING[source]}</span>
      <span className="hidden items-center gap-1.5 lg:flex">
        <span className="h-1 w-1 rounded-full bg-accent/70" />
        {t('statusbar.localOnly')}
      </span>
      <span className="tabular-nums text-ink-muted/80">{formatClock(now)}</span>
      <span className="hidden text-ink-faint/60 xl:inline">{t('app.version')}</span>
    </footer>
  )
}
