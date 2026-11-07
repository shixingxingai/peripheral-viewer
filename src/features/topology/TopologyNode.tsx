import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import {
  Bluetooth,
  Box,
  CircuitBoard,
  type LucideIcon,
  Monitor,
  PcCase,
  TriangleAlert,
  Usb,
} from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { cn } from '@/lib/utils'
import type { DeviceSnapshot, TopologyNode, TopologyNodeType } from '@/types/device'

export interface TopologyFlowData extends Record<string, unknown> {
  topology: TopologyNode
  device?: DeviceSnapshot
  typeLabel: string
}

export type TopologyFlowNode = Node<TopologyFlowData, 'topology'>

const TYPE_ICONS: Record<TopologyNodeType, LucideIcon> = {
  host: PcCase,
  controller: CircuitBoard,
  hub: Usb,
  device: Box,
  radio: Bluetooth,
  display: Monitor,
}

const TYPE_TONE: Record<TopologyNodeType, string> = {
  host: '#67e8f9',
  controller: '#38bdf8',
  hub: '#a78bfa',
  device: '#94a3b8',
  radio: '#2dd4bf',
  display: '#fb7185',
}

export function TopologyNodeCard({ data, selected }: NodeProps<TopologyFlowNode>) {
  const { topology, device, typeLabel } = data
  const Icon = device ? null : TYPE_ICONS[topology.type]
  const accent = device?.accent ?? TYPE_TONE[topology.type]
  const warning = topology.status === 'warning' || topology.status === 'critical'

  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border bg-[#090d15]/96 px-3 py-2.5 shadow-[0_16px_36px_-22px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors',
        selected
          ? 'border-[rgba(var(--accent-rgb),0.55)] shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.2),0_0_28px_-8px_rgba(var(--accent-rgb),0.5)]'
          : warning
            ? 'border-amber-400/32'
            : 'border-white/[0.09] hover:border-white/[0.2]',
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: warning ? '#fbbf24' : accent, opacity: 0.7 }}
      />
      <div className="flex items-center gap-2.5 pl-1">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
          style={{
            borderColor: `${accent}44`,
            background: `${accent}12`,
            color: accent,
          }}
        >
          {device ? (
            <CategoryIcon category={device.category} className="h-3.5 w-3.5" />
          ) : Icon ? (
            <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-ink">
            {topology.label}
          </p>
          <p className="mt-0.5 truncate text-[8.5px] leading-tight text-ink-faint">
            {topology.subtitle ?? typeLabel}
          </p>
        </div>
        {warning ? (
          <TriangleAlert className="h-3 w-3 shrink-0 text-amber-300" strokeWidth={1.8} />
        ) : (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}88` }}
          />
        )}
      </div>

      <span className="absolute bottom-1.5 right-2 font-mono text-[7px] uppercase tracking-[0.12em] text-ink-faint/40">
        {typeLabel}
      </span>

      <Handle
        type="target"
        position={Position.Left}
        className="!left-0 !h-1 !w-1 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!right-0 !h-1 !w-1 !border-0 !bg-transparent"
      />
    </div>
  )
}

export const topologyNodeTypes = { topology: TopologyNodeCard }
