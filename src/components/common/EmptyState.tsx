import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/[0.012] px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white/[0.025] text-ink-faint">
          <Icon className="h-5 w-5" strokeWidth={1.4} />
        </div>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
