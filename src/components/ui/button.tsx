import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-[#041014] shadow-[0_10px_30px_-12px_rgba(var(--accent-rgb),0.7)] hover:brightness-110',
        secondary:
          'border border-line bg-white/[0.045] text-ink hover:border-line-strong hover:bg-white/[0.075]',
        outline:
          'border border-line bg-transparent text-ink-muted hover:border-[rgba(var(--accent-rgb),0.35)] hover:bg-[rgba(var(--accent-rgb),0.05)] hover:text-ink',
        ghost: 'bg-transparent text-ink-muted hover:bg-white/[0.055] hover:text-ink',
        soft: 'border border-[rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.1)] text-accent hover:bg-[rgba(var(--accent-rgb),0.16)]',
        danger:
          'border border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/16 hover:text-rose-200',
      },
      size: {
        xs: 'h-7 rounded-md px-2 text-[11px]',
        sm: 'h-8 rounded-lg px-3 text-xs',
        md: 'h-9 px-3.5 text-[13px]',
        lg: 'h-10 rounded-xl px-4 text-sm',
        icon: 'h-9 w-9 p-0',
        iconSm: 'h-7 w-7 rounded-md p-0',
        iconLg: 'h-10 w-10 rounded-xl p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: ReactNode
}

export function Button({
  className,
  variant,
  size,
  icon,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {icon}
      {children}
    </button>
  )
}
