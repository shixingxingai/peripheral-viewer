import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-strong bg-white/[0.035] px-1 font-mono text-[9px] font-medium text-ink-faint',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}
