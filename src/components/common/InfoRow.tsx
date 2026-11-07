import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function InfoRow({
  label,
  value,
  mono,
  className,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-white/[0.045] py-2 last:border-0',
        className,
      )}
    >
      <span className="shrink-0 text-[11px] text-ink-faint">{label}</span>
      <span
        className={cn(
          'min-w-0 break-words text-right text-[11.5px] leading-relaxed text-ink-muted',
          mono && 'font-mono text-[10.5px] text-ink-muted/90',
        )}
      >
        {value}
      </span>
    </div>
  )
}
