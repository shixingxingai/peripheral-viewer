import { Zap } from 'lucide-react'
import { cn, hexToRgba } from '@/lib/utils'

export function BatteryRing({
  value,
  charging,
  size = 46,
  accent = '#67e8f9',
  className,
}: {
  value: number | null | undefined
  charging?: boolean
  size?: number
  accent?: string
  className?: string
}) {
  const stroke = 3.2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safeValue = value ?? 0
  const offset = circumference * (1 - Math.max(0, Math.min(100, safeValue)) / 100)
  const color =
    value === null || value === undefined
      ? '#4b5563'
      : value <= 20
        ? '#fb7185'
        : value <= 40
          ? '#fbbf24'
          : accent

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        role="img"
        aria-label={
          value === null || value === undefined ? '电量不可用' : `电量 ${Math.round(value)}%`
        }
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.16)"
          strokeWidth={stroke}
        />
        <circle
          className="ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 5px ${hexToRgba(color, 0.5)})` }}
        />
      </svg>
      <div className="flex items-baseline gap-px">
        <span className="metric-number text-[11px] font-semibold text-ink">
          {value === null || value === undefined ? '—' : Math.round(value)}
        </span>
        <span className="text-[8px] text-ink-faint">
          {value === null || value === undefined ? '' : '%'}
        </span>
      </div>
      {charging && (
        <Zap className="absolute -right-0.5 top-0 h-3 w-3 fill-amber-300 text-amber-300" />
      )}
    </div>
  )
}
