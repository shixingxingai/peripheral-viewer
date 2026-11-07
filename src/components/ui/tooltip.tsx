import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <TooltipPrimitive.Root delayDuration={260}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          className={cn(
            'z-[70] max-w-[280px] rounded-lg border border-line-strong bg-[#0b1019]/97 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-muted shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl',
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[#0b1019]" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
