import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ELK from 'elkjs/lib/elk.bundled.js'
import {
  ArrowUpRight,
  Bluetooth,
  Box,
  CircuitBoard,
  CloudOff,
  Info,
  Layers3,
  Loader2,
  type LucideIcon,
  Maximize2,
  Monitor,
  Network,
  PcCase,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Usb,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { DiagnosticCard } from '@/components/common/DiagnosticCard'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { SectionCard } from '@/components/common/SectionCard'
import { TopologyStatusDot } from '@/components/common/StatusDot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDataSource } from '@/hooks/useDataSource'
import { useDiagnostics, useHotplugSimulation, useTopology } from '@/hooks/useDeviceData'
import { canSimulateHotplug } from '@/lib/dataSourceText'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { Diagnosis, TopologyGraph, TopologyNode, TopologyNodeType } from '@/types/device'
import { type TopologyFlowData, type TopologyFlowNode, topologyNodeTypes } from './TopologyNode'

const NODE_WIDTH: Record<TopologyNodeType, number> = {
  host: 206,
  controller: 196,
  hub: 196,
  device: 202,
  radio: 196,
  display: 196,
}

const NODE_HEIGHT: Record<TopologyNodeType, number> = {
  host: 62,
  controller: 58,
  hub: 58,
  device: 58,
  radio: 58,
  display: 58,
}

const TYPE_ICONS: Record<TopologyNodeType, LucideIcon> = {
  host: PcCase,
  controller: CircuitBoard,
  hub: Usb,
  device: Box,
  radio: Bluetooth,
  display: Monitor,
}

const TYPE_COLORS: Record<TopologyNodeType, string> = {
  host: '#67e8f9',
  controller: '#38bdf8',
  hub: '#a78bfa',
  device: '#94a3b8',
  radio: '#2dd4bf',
  display: '#fb7185',
}

function statusVariant(status: TopologyNode['status']) {
  if (status === 'warning') return 'warning' as const
  if (status === 'critical') return 'danger' as const
  if (status === 'ok') return 'success' as const
  return 'neutral' as const
}

function TopologyCanvas({
  topology,
  selectedNodeId,
  onSelectNode,
}: {
  topology: TopologyGraph
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
}) {
  const { t } = useTranslation()
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyFlowNode>([])
  const [loading, setLoading] = useState(true)
  const [layoutReady, setLayoutReady] = useState(false)
  const { fitView } = useReactFlow()
  // 布局重算需要读取当前选中项，但选中变化不应触发 ELK 重排，故用 ref 读取最新值。
  const selectedNodeIdRef = useRef(selectedNodeId)
  selectedNodeIdRef.current = selectedNodeId

  useEffect(() => {
    let cancelled = false
    const elk = new ELK()

    const run = async () => {
      setLoading(true)
      setLayoutReady(false)
      const deviceMap = new Map(
        useDeviceStore.getState().devices.map((device) => [device.id, device]),
      )
      const graph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': '26',
          'elk.layered.spacing.nodeNodeBetweenLayers': '72',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.padding': '[top=24,left=24,bottom=24,right=24]',
        },
        children: topology.nodes.map((node) => ({
          id: node.id,
          width: NODE_WIDTH[node.type],
          height: NODE_HEIGHT[node.type],
        })),
        edges: topology.edges.map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })),
      }

      const result = await elk.layout(graph)
      if (cancelled) return

      const positions = new Map<string, { x: number; y: number }>()
      for (const child of result.children ?? []) {
        positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
      }

      setNodes(
        topology.nodes.map((node) => ({
          id: node.id,
          type: 'topology' as const,
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          data: {
            topology: node,
            device: node.deviceId ? deviceMap.get(node.deviceId) : undefined,
            typeLabel: t(`topology.type.${node.type}`),
          } satisfies TopologyFlowData,
          style: { width: NODE_WIDTH[node.type] },
          selected: node.id === selectedNodeIdRef.current,
        })),
      )
      setLoading(false)
      setLayoutReady(true)
    }

    void run()
    return () => {
      cancelled = true
    }
    // 选中态由下面的 effect 单独同步；重排只由图谱变化触发。
  }, [topology, t, setNodes])

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === selectedNodeId })),
    )
  }, [selectedNodeId, setNodes])

  useEffect(() => {
    if (!layoutReady) return
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.14, duration: 420 })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [fitView, layoutReady])

  const edges = useMemo<Edge[]>(
    () =>
      topology.edges.map((edge) => {
        const warning = edge.status === 'warning'
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          animated: warning,
          label: edge.label,
          labelStyle: {
            fill: warning ? '#fcd34d' : '#7f8ba1',
            fontSize: 8.5,
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: '#070a11',
            fillOpacity: 0.88,
          },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 3,
          style: {
            stroke: warning ? '#fbbf24' : 'rgba(148,163,184,0.26)',
            strokeWidth: warning ? 1.5 : 1.15,
            strokeDasharray: warning ? '5 4' : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: warning ? '#fbbf24' : 'rgba(148,163,184,0.5)',
            width: 12,
            height: 12,
          },
        }
      }),
    [topology.edges],
  )

  return (
    <div className="relative h-full w-full">
      <ReactFlow<TopologyFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={topologyNodeTypes as NodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        nodesConnectable={false}
        minZoom={0.25}
        maxZoom={1.6}
        panOnScroll
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <Background variant={'dots' as never} gap={22} size={1} color="#1b2534" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          maskColor="rgba(4,6,11,0.72)"
          style={{ width: 150, height: 96 }}
          nodeColor={(node) => {
            const data = node.data as TopologyFlowData
            return data.device?.accent ?? TYPE_COLORS[data.topology.type]
          }}
          nodeStrokeWidth={2}
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          fitViewOptions={{ padding: 0.14 }}
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-white/[0.08] bg-[#070a11]/72 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint backdrop-blur-md">
          LINK MAP · {topology.edges.length} LINKS
        </span>
        <span className="rounded-md border border-[rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.06)] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-accent/80 backdrop-blur-md">
          ELK · LAYERED
        </span>
      </div>

      <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void fitView({ padding: 0.14, duration: 420 })}
          className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#070a11]/72 px-2 font-mono text-[8.5px] uppercase tracking-wide text-ink-faint backdrop-blur-md transition-colors hover:text-ink"
        >
          <Maximize2 className="h-2.5 w-2.5" />
          {t('topology.fit')}
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-[170px] z-10 hidden items-center gap-1.5 rounded-md border border-white/[0.07] bg-[#070a11]/60 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/80 backdrop-blur-md md:flex">
        <Info className="h-2.5 w-2.5" />
        {t('topology.hint')}
      </div>

      {loading ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#06080d]/72 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            {t('topology.loading')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function NodeDetails({
  topology,
  selectedNodeId,
  diagnostics,
  onSelectNode,
}: {
  topology: TopologyGraph
  selectedNodeId: string | null
  diagnostics: Diagnosis[]
  onSelectNode: (id: string) => void
}) {
  const { t } = useTranslation()
  const language = useSettingsStore((state) => state.language)
  const devices = useDeviceStore((state) => state.devices)
  const select = useDeviceStore((state) => state.select)
  const openDevice = useUiStore((state) => state.openDevice)
  const setPage = useUiStore((state) => state.setPage)

  const node = topology.nodes.find((item) => item.id === selectedNodeId)
  if (!node) {
    return (
      <SectionCard title={t('topology.panel.title')} bodyClassName="p-4">
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Network className="h-6 w-6 text-ink-faint/60" strokeWidth={1.4} />
          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            {t('topology.panel.empty')}
          </p>
        </div>
      </SectionCard>
    )
  }

  const device = node.deviceId ? devices.find((item) => item.id === node.deviceId) : undefined
  const parent = node.parentId ? topology.nodes.find((item) => item.id === node.parentId) : null
  const children = topology.nodes.filter((item) => item.parentId === node.id)
  const related = diagnostics.filter(
    (diagnosis) =>
      (node.deviceId && diagnosis.deviceId === node.deviceId) ||
      (!diagnosis.deviceId && diagnosis.scope === 'topology'),
  )
  const Icon = device ? null : TYPE_ICONS[node.type]

  return (
    <SectionCard
      title={t('topology.panel.title')}
      action={
        <Badge variant={statusVariant(node.status)} size="sm">
          <TopologyStatusDot status={node.status} />
          {node.status === 'ok'
            ? t('status.online')
            : node.status === 'warning'
              ? t('status.warning')
              : node.status === 'critical'
                ? t('severity.critical')
                : t('status.idle')}
        </Badge>
      }
      bodyClassName="p-4"
    >
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{
            color: device?.accent ?? TYPE_COLORS[node.type],
            borderColor: `${device?.accent ?? TYPE_COLORS[node.type]}44`,
            background: `${device?.accent ?? TYPE_COLORS[node.type]}12`,
          }}
        >
          {device ? (
            <CategoryIcon category={device.category} className="h-4 w-4" />
          ) : Icon ? (
            <Icon className="h-4 w-4" strokeWidth={1.7} />
          ) : null}
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold leading-tight text-ink">{node.label}</h2>
          <p className="mt-1 text-[9.5px] leading-relaxed text-ink-faint">
            {node.subtitle ?? t(`topology.type.${node.type}`)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge variant="outline" size="sm">
              {t(`topology.type.${node.type}`)}
            </Badge>
            {device ? (
              <Badge variant={device.status === 'warning' ? 'warning' : 'success'} size="sm">
                {device.battery !== null && device.battery !== undefined
                  ? `${Math.round(device.battery)}%`
                  : device.connection.protocol}
              </Badge>
            ) : null}
            {children.length > 0 ? (
              <Badge variant="neutral" size="sm">
                {children.length} {t('topology.panel.devices')}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {parent ? (
        <button
          type="button"
          onClick={() => onSelectNode(parent.id)}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.016] px-2.5 py-2 text-left transition-colors hover:border-line-strong"
        >
          <span className="text-[9px] text-ink-faint">{t('topology.panel.parent')}</span>
          <span className="ml-2 flex min-w-0 items-center gap-1.5 text-[10px] text-ink-muted">
            <span className="truncate">{parent.label}</span>
            <ArrowUpRight className="h-2.5 w-2.5 shrink-0" />
          </span>
        </button>
      ) : null}

      {node.meta ? (
        <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.014] px-3 py-1">
          {Object.entries(node.meta).map(([key, value]) => (
            <div
              key={key}
              className="flex items-start justify-between gap-3 border-b border-white/[0.045] py-1.5 last:border-0"
            >
              <span className="shrink-0 text-[9.5px] text-ink-faint">{key}</span>
              <span className="min-w-0 break-words text-right font-mono text-[9px] text-ink-muted">
                {value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {device ? (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.016] px-2.5 py-2">
            <p className="text-[8.5px] text-ink-faint">{t('connection.ports')}</p>
            <p className="metric-number mt-1 text-[13px] font-semibold text-ink">
              {device.ports.length}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.016] px-2.5 py-2">
            <p className="text-[8.5px] text-ink-faint">{t('connection.reconnect')}</p>
            <p className="metric-number mt-1 text-[13px] font-semibold text-ink">
              {device.reconnectCount}
            </p>
          </div>
        </div>
      ) : null}

      {children.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {t('topology.panel.link')} · {children.length}
          </p>
          <div className="space-y-1">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelectNode(child.id)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-left transition-colors hover:border-line hover:bg-white/[0.025]"
              >
                <TopologyStatusDot status={child.status} />
                <span className="min-w-0 flex-1 truncate text-[9.5px] text-ink-muted">
                  {child.label}
                </span>
                <span className="font-mono text-[8px] text-ink-faint/60">
                  {child.type.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {related.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {related.slice(0, 2).map((diagnosis) => (
            <DiagnosticCard key={diagnosis.id} diagnosis={diagnosis} compact />
          ))}
        </div>
      ) : null}

      {device ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            icon={<Box className="h-3.5 w-3.5" />}
            onClick={() => {
              select(device.id)
              setPage('viewer')
            }}
          >
            {t('topology.panel.open3d')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Info className="h-3.5 w-3.5" />}
            onClick={() => openDevice(device.id)}
          >
            {t('common.detail')}
          </Button>
        </div>
      ) : null}

      <p className="mt-2 text-right font-mono text-[8px] text-ink-faint/50">
        {formatRelativeTime(topology.scannedAt, language)}
      </p>
    </SectionCard>
  )
}

export function TopologyPage() {
  const { t } = useTranslation()
  const { source } = useDataSource()
  const topology = useTopology()
  const diagnostics = useDiagnostics()
  const simulateHotplug = useHotplugSimulation()
  const devices = useDeviceStore((state) => state.devices)
  const select = useDeviceStore((state) => state.select)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const language = useSettingsStore((state) => state.language)

  const handleSelectNode = useCallback(
    (id: string) => {
      setSelectedNodeId(id)
      const node = topology.data?.nodes.find((item) => item.id === id)
      if (node?.deviceId) select(node.deviceId)
    },
    [select, topology.data],
  )

  useEffect(() => {
    if (!topology.data) return
    setSelectedNodeId((current) => {
      if (current && topology.data?.nodes.some((node) => node.id === current)) return current
      return (
        topology.data.nodes.find((node) => node.type === 'host')?.id ??
        topology.data.nodes[0]?.id ??
        ''
      )
    })
  }, [topology.data])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([topology.refetch(), diagnostics.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  const counts = useMemo(() => {
    const nodes = topology.data?.nodes ?? []
    return {
      controllers: nodes.filter((node) => ['controller', 'radio', 'display'].includes(node.type))
        .length,
      hubs: nodes.filter((node) => node.type === 'hub').length,
      devices: nodes.filter((node) => node.type === 'device').length,
      warnings: (topology.data?.edges ?? []).filter((edge) => edge.status === 'warning').length,
    }
  }, [topology.data])

  const deviceNames = useMemo(
    () => new Map(devices.map((device) => [device.id, device.name])),
    [devices],
  )

  return (
    <div className="mx-auto max-w-[1540px] px-4 py-5 xl:px-7 xl:py-6">
      <PageHeader
        eyebrow={
          <>
            <span className="text-accent/80">TOPOLOGY</span>
            <span className="text-ink-faint/40">/</span>
            <span>LINK MAP</span>
          </>
        }
        title={t('topology.title')}
        subtitle={t('topology.subtitle')}
        actions={
          <>
            {canSimulateHotplug(source) ? (
              <Button
                variant="secondary"
                size="md"
                icon={<PlugZap className="h-3.5 w-3.5" />}
                onClick={() => void simulateHotplug()}
              >
                {t('common.simulate')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="md"
              icon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />}
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { icon: CircuitBoard, label: t('topology.type.controller'), value: counts.controllers },
          { icon: Layers3, label: t('topology.type.hub'), value: counts.hubs },
          { icon: Box, label: t('topology.type.device'), value: counts.devices },
          {
            icon: TriangleAlert,
            label: t('topology.legend.warning'),
            value: counts.warnings,
            warning: true,
          },
        ].map((item) => {
          const Icon = item.icon
          return (
            <span
              key={item.label}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
                item.warning && item.value > 0
                  ? 'border-amber-400/18 bg-amber-400/[0.05]'
                  : 'border-line bg-white/[0.018]',
              )}
            >
              <Icon
                className={cn(
                  'h-3 w-3',
                  item.warning && item.value > 0 ? 'text-amber-300' : 'text-ink-faint',
                )}
                strokeWidth={1.8}
              />
              <span className="text-[9.5px] text-ink-faint">{item.label}</span>
              <span
                className={cn(
                  'metric-number text-[11px] font-semibold',
                  item.warning && item.value > 0 ? 'text-amber-300' : 'text-ink',
                )}
              >
                {item.value}
              </span>
            </span>
          )
        })}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-faint/60">
          <span className="live-dot scale-[0.6]" />
          {topology.data ? formatRelativeTime(topology.data.scannedAt, language) : '—'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="panel relative h-[calc(100vh-292px)] min-h-[580px] overflow-hidden">
          {topology.isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
              <p className="text-[10px] text-ink-faint">{t('topology.loading')}</p>
            </div>
          ) : topology.data ? (
            <ReactFlowProvider>
              <TopologyCanvas
                topology={topology.data}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
              />
            </ReactFlowProvider>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={CloudOff}
                title={t('toast.loadFailed')}
                description="ELK layout / topology data unavailable"
                action={
                  <Button variant="secondary" size="sm" onClick={() => void refresh()}>
                    {t('common.refresh')}
                  </Button>
                }
              />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3 xl:max-h-[calc(100vh-292px)] xl:overflow-y-auto xl:pr-1 scroll-thin">
          {topology.data ? (
            <NodeDetails
              topology={topology.data}
              selectedNodeId={selectedNodeId}
              diagnostics={diagnostics.data ?? []}
              onSelectNode={handleSelectNode}
            />
          ) : null}

          <SectionCard
            title={t('telemetry.insights.title')}
            subtitle={`${(diagnostics.data ?? []).filter((item) => item.severity !== 'info').length} ${t('statusbar.warnings')}`}
            bodyClassName="p-3"
          >
            <div className="space-y-2">
              {(diagnostics.data ?? [])
                .filter(
                  (diagnosis) => diagnosis.scope === 'topology' || diagnosis.severity !== 'info',
                )
                .slice(0, 3)
                .map((diagnosis) => (
                  <DiagnosticCard
                    key={diagnosis.id}
                    diagnosis={diagnosis}
                    deviceName={
                      diagnosis.deviceId ? deviceNames.get(diagnosis.deviceId) : undefined
                    }
                    compact
                  />
                ))}
            </div>
          </SectionCard>

          <SectionCard title={t('topology.legendTitle')} bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['host', PcCase],
                  ['controller', CircuitBoard],
                  ['hub', Usb],
                  ['device', Box],
                  ['radio', Bluetooth],
                  ['display', Monitor],
                ] as Array<[TopologyNodeType, LucideIcon]>
              ).map(([type, Icon]) => (
                <span
                  key={type}
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5 text-[9px] text-ink-muted"
                >
                  <Icon
                    className="h-2.5 w-2.5"
                    style={{ color: TYPE_COLORS[type] }}
                    strokeWidth={1.8}
                  />
                  {t(`topology.type.${type}`)}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 border-t border-white/[0.05] pt-2 text-[9px] text-ink-faint">
              <span className="h-px w-5 border-t border-dashed border-amber-400" />
              {t('topology.legend.warning')}
            </div>
          </SectionCard>

          <div className="rounded-xl border border-line bg-white/[0.012] p-3 text-[9px] leading-relaxed text-ink-faint">
            <div className="flex items-center gap-1.5 text-ink-muted">
              <ShieldCheck className="h-3 w-3 text-emerald-400/70" strokeWidth={1.8} />
              {t('common.readOnly')} · USB / HID / Bluetooth
            </div>
            <p className="mt-1.5">{t('topology.hint')}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
