import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line bg-black/20 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[6px] font-medium transition-colors duration-150',
              size === 'sm' ? 'h-6 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]',
              active
                ? 'bg-[rgba(var(--accent-rgb),0.14)] text-accent shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.22)]'
                : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-muted',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
