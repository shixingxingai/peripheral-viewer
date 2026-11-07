import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('panel overflow-hidden', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[11.5px] font-semibold tracking-[0.02em] text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
