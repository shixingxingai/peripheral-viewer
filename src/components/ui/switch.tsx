import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200',
        checked
          ? 'border-[rgba(var(--accent-rgb),0.5)] bg-[rgba(var(--accent-rgb),0.28)]'
          : 'border-line-strong bg-white/[0.06]',
        disabled && 'cursor-not-allowed opacity-45',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-[16px] w-[16px] rounded-full shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[19px] bg-accent' : 'translate-x-[2px] bg-[#8b97ac]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
