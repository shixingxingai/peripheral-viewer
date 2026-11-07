import { cn } from '@/lib/utils'

export function TopologyStatusDot({
  status,
  className,
}: {
  status: 'ok' | 'warning' | 'critical' | 'idle'
  className?: string
}) {
  const tone =
    status === 'ok'
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
      : status === 'warning'
        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
        : status === 'critical'
          ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]'
          : 'bg-slate-600'
  return (
    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone, className)} aria-hidden />
  )
}
