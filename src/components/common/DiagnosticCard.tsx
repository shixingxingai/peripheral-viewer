import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import type { Diagnosis } from '@/types/device'

const TONE = {
  info: {
    icon: Info,
    iconClass: 'text-sky-300',
    box: 'border-sky-400/14 bg-sky-400/[0.045]',
    label: 'text-sky-300/80',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-300',
    box: 'border-amber-400/18 bg-amber-400/[0.055]',
    label: 'text-amber-300/80',
  },
  critical: {
    icon: ShieldAlert,
    iconClass: 'text-rose-300',
    box: 'border-rose-400/18 bg-rose-400/[0.055]',
    label: 'text-rose-300/80',
  },
} as const

export function DiagnosticCard({
  diagnosis,
  deviceName,
  compact = false,
  className,
}: {
  diagnosis: Diagnosis
  deviceName?: string
  compact?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const language = useSettingsStore((state) => state.language)
  const tone = TONE[diagnosis.severity]
  const Icon = tone.icon

  return (
    <div className={cn('rounded-xl border p-3', tone.box, className)}>
      <div className="flex gap-2.5">
        <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-black/20">
          <Icon className={cn('h-3.5 w-3.5', tone.iconClass)} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11.5px] font-medium leading-snug text-ink">{diagnosis.title}</p>
            <span
              className={cn('shrink-0 font-mono text-[8.5px] uppercase tracking-wider', tone.label)}
            >
              {t(`severity.${diagnosis.severity}`)}
            </span>
          </div>
          <p
            className={cn(
              'mt-1 text-[10px] leading-relaxed text-ink-faint',
              compact && 'line-clamp-2',
            )}
          >
            {diagnosis.detail}
          </p>
          {!compact && diagnosis.suggestion ? (
            <p className="mt-1.5 border-l border-white/[0.08] pl-2 text-[10px] leading-relaxed text-ink-muted/80">
              {diagnosis.suggestion}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-ink-faint/70">
            {deviceName ? <span>{deviceName}</span> : null}
            {deviceName ? <span>·</span> : null}
            <span>{formatRelativeTime(diagnosis.createdAt, language)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
