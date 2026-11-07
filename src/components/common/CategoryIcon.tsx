import {
  Box,
  Gamepad2,
  Headphones,
  Keyboard,
  type LucideIcon,
  Mic,
  Monitor,
  Mouse,
  Speaker,
  Webcam,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { DeviceCategory } from '@/types/device'

const ICONS: Record<DeviceCategory, LucideIcon> = {
  keyboard: Keyboard,
  mouse: Mouse,
  headset: Headphones,
  monitor: Monitor,
  webcam: Webcam,
  gamepad: Gamepad2,
  microphone: Mic,
  speaker: Speaker,
  other: Box,
}

export function CategoryIcon({
  category,
  className,
  strokeWidth = 1.7,
  style,
}: {
  category: DeviceCategory
  className?: string
  strokeWidth?: number
  style?: CSSProperties
}) {
  const Icon = ICONS[category] ?? Box
  return (
    <Icon
      className={cn('h-4 w-4', className)}
      strokeWidth={strokeWidth}
      style={style}
      aria-hidden
    />
  )
}
