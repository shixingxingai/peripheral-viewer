import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-1', className)}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.26em] text-ink-faint">
            <span className="h-px w-5 bg-accent/50" />
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[28px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
