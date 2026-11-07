import { Bluetooth, Cable, Usb, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DeviceConnection, DevicePort, DeviceStatus } from '@/types/device'

export function ConnectionBadge({
  connection,
  className,
}: {
  connection: DeviceConnection
  className?: string
}) {
  const Icon =
    connection.kind === 'bluetooth'
      ? Bluetooth
      : connection.kind === 'wireless'
        ? Wifi
        : connection.kind === 'wired'
          ? Cable
          : Usb
  const label =
    connection.kind === 'bluetooth'
      ? 'Bluetooth'
      : connection.kind === 'wireless'
        ? connection.speed
          ? `2.4G · ${connection.speed}`
          : '2.4 GHz'
        : connection.protocol.replace(/·.*/, '').trim()

  return (
    <Badge variant="outline" className={cn('gap-1.5', className)}>
      <Icon className="h-3 w-3" strokeWidth={1.8} />
      {label}
    </Badge>
  )
}

export function StatusBadge({
  status,
  label,
  className,
  size,
}: {
  status: DeviceStatus
  label: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const variant =
    status === 'warning'
      ? 'warning'
      : status === 'online'
        ? 'success'
        : status === 'idle'
          ? 'neutral'
          : 'danger'
  const dot =
    status === 'warning'
      ? 'bg-amber-400'
      : status === 'online'
        ? 'bg-emerald-400'
        : status === 'idle'
          ? 'bg-slate-400'
          : 'bg-slate-600'
  return (
    <Badge variant={variant} size={size} className={cn('gap-1.5', className)}>
      <span className={cn('h-1 w-1 rounded-full', dot)} />
      {label}
    </Badge>
  )
}

export function PortStatusBadge({ port }: { port: DevicePort }) {
  const { t } = useTranslation()
  if (port.status === 'warning') {
    return <Badge variant="warning">{t('status.warning')}</Badge>
  }
  if (port.status === 'linked') {
    return <Badge variant="success">{t('status.online')}</Badge>
  }
  return <Badge variant="neutral">{t('status.idle')}</Badge>
}
