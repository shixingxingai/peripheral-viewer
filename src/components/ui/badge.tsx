import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border font-medium leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-white/[0.035] text-ink-muted',
        accent:
          'border-[rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--accent-rgb),0.09)] text-accent',
        success: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300',
        warning: 'border-amber-400/22 bg-amber-400/9 text-amber-300',
        danger: 'border-rose-400/22 bg-rose-400/9 text-rose-300',
        outline: 'border-line bg-transparent text-ink-muted',
      },
      size: {
        sm: 'px-1.5 py-1 text-[9px] tracking-[0.04em]',
        md: 'px-2 py-1.5 text-[10px]',
        lg: 'px-2.5 py-1.5 text-[11px]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}
