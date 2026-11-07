import {
  Activity,
  ArrowUpRight,
  BatteryCharging,
  Cable,
  Crosshair,
  Download,
  Gauge,
  Info,
  type LucideIcon,
  PlugZap,
  Radio,
  ShieldCheck,
  Signal,
  Thermometer,
  Timer,
  TriangleAlert,
  Unplug,
  Usb,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EChart, type EChartOption } from '@/components/charts/EChart'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { DiagnosticCard } from '@/components/common/DiagnosticCard'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { SectionCard } from '@/components/common/SectionCard'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { useDataSource } from '@/hooks/useDataSource'
import { useDiagnostics, useEvents, useTelemetryHistory } from '@/hooks/useDeviceData'
import { getDataSource } from '@/lib/backend/source'
import { DATA_SOURCE_SAMPLING, DATA_SOURCE_SHORT, isLiveSource } from '@/lib/dataSourceText'
import { cn, downloadBlob, formatNumber, formatRelativeTime, hexToRgba } from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { DeviceEventLog, DeviceSnapshot, MetricKey } from '@/types/device'

const METRICS: Array<{
  key: MetricKey
  icon: LucideIcon
  color: string
}> = [
  { key: 'battery', icon: BatteryCharging, color: '#34d399' },
  { key: 'pollingRate', icon: Gauge, color: '#67e8f9' },
  { key: 'dpi', icon: Crosshair, color: '#a78bfa' },
  { key: 'signal', icon: Signal, color: '#38bdf8' },
  { key: 'temperature', icon: Thermometer, color: '#fb923c' },
  { key: 'latency', icon: Timer, color: '#f472b6' },
]

function metricValue(device: DeviceSnapshot, metric: MetricKey): number | null {
  if (metric === 'battery') return device.battery ?? null
  return device.telemetry[metric] ?? null
}

function formatMetric(value: number | null | undefined, metric: MetricKey): string {
  if (value === null || value === undefined) return '—'
  if (metric === 'dpi') return formatNumber(Math.round(value))
  if (metric === 'battery') return formatNumber(value, 0)
  if (metric === 'pollingRate') return formatNumber(Math.round(value))
  return formatNumber(value, 1)
}

function EventRow({ event }: { event: DeviceEventLog }) {
  const language = useSettingsStore((state) => state.language)
  const config: Record<DeviceEventLog['kind'], { icon: LucideIcon; tone: string; bg: string }> = {
    connected: {
      icon: PlugZap,
      tone: 'text-emerald-300',
      bg: 'bg-emerald-400/8 border-emerald-400/16',
    },
    disconnected: {
      icon: Unplug,
      tone: 'text-amber-300',
      bg: 'bg-amber-400/8 border-amber-400/16',
    },
    warning: {
      icon: TriangleAlert,
      tone: 'text-amber-300',
      bg: 'bg-amber-400/8 border-amber-400/16',
    },
    info: { icon: Info, tone: 'text-sky-300', bg: 'bg-sky-400/8 border-sky-400/16' },
  }
  const tone = config[event.kind]
  const Icon = tone.icon
  return (
    <div className="relative flex gap-2.5 pl-1">
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
          tone.bg,
        )}
      >
        <Icon className={cn('h-3 w-3', tone.tone)} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1 border-b border-white/[0.045] pb-2 last:border-0">
        <p className="line-clamp-2 text-[9.5px] leading-relaxed text-ink-muted">{event.message}</p>
        <p className="mt-0.5 font-mono text-[8px] text-ink-faint/70">
          {formatRelativeTime(event.ts, language)}
        </p>
      </div>
    </div>
  )
}

export function TelemetryPage() {
  const { t } = useTranslation()
  const { source } = useDataSource()
  const devices = useDeviceStore((state) => state.devices)
  const selectedId = useDeviceStore((state) => state.selectedId)
  const select = useDeviceStore((state) => state.select)
  const setStatus = useDeviceStore((state) => state.setStatus)
  const setSearch = useDeviceStore((state) => state.setSearch)
  const setPage = useUiStore((state) => state.setPage)
  const pushToast = useUiStore((state) => state.pushToast)
  const _language = useSettingsStore((state) => state.language)
  const telemetryEnabled = useSettingsStore((state) => state.telemetryEnabled)
  const retentionDays = useSettingsStore((state) => state.retentionDays)
  const diagnostics = useDiagnostics()
  const events = useEvents()

  const device = devices.find((item) => item.id === selectedId) ?? devices[0] ?? null
  const [metric, setMetric] = useState<MetricKey>('battery')
  const [hours, setHours] = useState(24)

  const _availability = METRICS.map((item) =>
    device ? metricValue(device, item.key) !== null : false,
  ).join('|')

  useEffect(() => {
    if (!device) return
    if (metricValue(device, metric) === null) {
      const next = METRICS.find((item) => metricValue(device, item.key) !== null)
      if (next) setMetric(next.key)
    }
    // Re-evaluate whenever the device or its available-metric fingerprint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, metric, device])

  const history = useTelemetryHistory(device?.id ?? null, metric, hours)
  const points = history.data ?? []
  const available = device ? metricValue(device, metric) !== null : false
  const metricMeta = METRICS.find((item) => item.key === metric) ?? METRICS[0]
  const metricLabel = t(`telemetry.metric.${metric}`)
  const unit = t(`telemetry.unit.${metric}`)
  const values = points.map((point) => point.value)
  const current = device ? metricValue(device, metric) : null
  const average =
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const minimum = values.length > 0 ? Math.min(...values) : null
  const maximum = values.length > 0 ? Math.max(...values) : null
  const change = values.length > 1 ? values[values.length - 1] - values[0] : null

  const deviceNames = useMemo(() => new Map(devices.map((item) => [item.id, item.name])), [devices])

  const option = useMemo<EChartOption | null>(() => {
    if (!device || points.length === 0) return null
    const color = metricMeta.color
    const format = (value: number) =>
      metric === 'battery'
        ? `${value.toFixed(1)}%`
        : metric === 'dpi'
          ? `${Math.round(value).toLocaleString()} DPI`
          : `${value.toFixed(metric === 'temperature' || metric === 'latency' ? 1 : 0)} ${unit}`
    const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
      month: hours >= 168 ? '2-digit' : undefined,
      day: hours >= 168 ? '2-digit' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    return {
      animationDuration: 450,
      animationEasing: 'cubicOut',
      grid: { left: 8, right: 12, top: 22, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(8, 12, 20, 0.96)',
        borderColor: 'rgba(148, 163, 184, 0.18)',
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: '#e8eef7', fontSize: 10, fontFamily: 'Inter, Segoe UI, sans-serif' },
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(148,163,184,0.3)', width: 1 } },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          const item = list[0] as { value?: [number, number] }
          const point = item?.value ?? [0, 0]
          return `<div style="font-size:9px;color:#8b97ac;margin-bottom:3px">${dateFormatter.format(
            point[0],
          )}</div><div style="display:flex;align-items:center;gap:5px"><span style="width:5px;height:5px;border-radius:50%;background:${color}"></span><b style="font-size:12px">${format(
            point[1],
          )}</b></div>`
        },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#5b6678',
          fontSize: 9,
          hideOverlap: true,
          formatter: (value: number) => dateFormatter.format(value),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitNumber: 4,
        axisLabel: {
          color: '#5b6678',
          fontSize: 9,
          formatter: (value: number) => `${formatNumber(value, metric === 'battery' ? 0 : 1)}`,
        },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.06)', type: 'dashed' } },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'line',
          data: points.map((point) => [point.ts, point.value]),
          smooth: 0.32,
          showSymbol: false,
          symbolSize: 5,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: hexToRgba(color, 0.32) },
                { offset: 1, color: hexToRgba(color, 0) },
              ],
            },
          },
          emphasis: { focus: 'series', scale: false },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: hexToRgba(color, 0.32), type: 'dashed', width: 1 },
            label: {
              show: true,
              position: 'insideEndTop',
              color: '#5b6678',
              fontSize: 8,
              formatter: `AVG ${average !== null ? formatMetric(average, metric) : '—'}`,
            },
            data: [{ type: 'average' }],
          },
        },
      ],
    }
  }, [average, device, hours, metric, metricMeta.color, points, unit])

  if (!device) {
    return (
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center p-6">
        <EmptyState
          icon={Activity}
          title={t('viewer.empty.title')}
          description={t('viewer.empty.detail')}
          action={
            <Button variant="primary" size="sm" onClick={() => setPage('overview')}>
              {t('overview.title')}
            </Button>
          }
        />
      </div>
    )
  }

  const exportCsv = () => {
    if (points.length === 0) return
    const header = 'timestamp,iso_time,metric,value,unit,data_source'
    const source = getDataSource()
    const rows = points.map(
      (point) =>
        `${point.ts},${new Date(point.ts).toISOString()},${metric},${point.value},${unit},${source}`,
    )
    const csv = `\ufeff${[header, ...rows].join('\n')}`
    const safeName = device.name.replace(/[\\/:*?"<>|\s]+/g, '-').toLowerCase()
    downloadBlob(
      `${safeName}-${metric}-${hours}h.csv`,
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    )
    pushToast({ title: t('telemetry.exportDone'), variant: 'success' })
  }

  const failed = (diagnostics.data ?? []).filter((item) => item.severity !== 'info')

  return (
    <div className="mx-auto max-w-[1540px] px-4 py-5 xl:px-7 xl:py-6">
      <PageHeader
        eyebrow={
          <>
            <span className="text-accent/80">TELEMETRY</span>
            <span className="text-ink-faint/40">/</span>
            <span>SAMPLING</span>
          </>
        }
        title={t('telemetry.title')}
        subtitle={t('telemetry.subtitle')}
        actions={
          <>
            <span className="hidden items-center gap-1.5 rounded-lg border border-emerald-400/16 bg-emerald-400/[0.05] px-2.5 py-2 text-[9.5px] text-emerald-300/80 sm:flex">
              <span className="live-dot scale-[0.7]" />
              {source === 'demo' ? t('telemetry.live') : DATA_SOURCE_SHORT[source]}
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
                <CategoryIcon category={device.category} className="h-3.5 w-3.5" />
              </span>
              <select
                value={device.id}
                onChange={(event) => select(event.target.value)}
                aria-label={t('telemetry.selectDevice')}
                className="h-9 max-w-[260px] appearance-none truncate rounded-lg border border-line bg-white/[0.025] pl-8 pr-8 text-[11px] text-ink outline-none transition-colors hover:border-line-strong focus:border-[rgba(var(--accent-rgb),0.4)]"
              >
                {devices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.manufacturer}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </>
        }
      />

      {!telemetryEnabled ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-400/18 bg-amber-400/[0.05] p-3">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-300" strokeWidth={1.8} />
          <div>
            <p className="text-[10.5px] font-medium text-amber-200">{t('telemetry.disabled')}</p>
            <p className="mt-0.5 text-[9.5px] leading-relaxed text-amber-200/60">
              {t('telemetry.disabledDetail')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPage('settings')}
            className="ml-auto shrink-0 text-[9.5px] text-amber-300/80 underline-offset-2 hover:underline"
          >
            {t('nav.settings')}
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {METRICS.map((item) => {
          const Icon = item.icon
          const value = metricValue(device, item.key)
          const active = metric === item.key
          const isAvailable = value !== null
          return (
            <button
              key={item.key}
              type="button"
              disabled={!isAvailable}
              onClick={() => setMetric(item.key)}
              className={cn(
                'panel group relative overflow-hidden p-3 text-left transition-all duration-200',
                active && 'border-[rgba(var(--accent-rgb),0.4)] bg-[rgba(var(--accent-rgb),0.045)]',
                isAvailable ? 'panel-hover' : 'cursor-not-allowed opacity-45',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md border"
                  style={{
                    borderColor: hexToRgba(item.color, active ? 0.4 : 0.18),
                    background: hexToRgba(item.color, active ? 0.12 : 0.05),
                    color: item.color,
                  }}
                >
                  <Icon className="h-3 w-3" strokeWidth={1.8} />
                </span>
                {isAvailable ? (
                  <span className="flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-faint/70">
                    <span className="live-dot scale-[0.5]" />
                    live
                  </span>
                ) : (
                  <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-faint/50">
                    n/a
                  </span>
                )}
              </div>
              <p className="mt-2 text-[9px] text-ink-faint">{t(`telemetry.metric.${item.key}`)}</p>
              <p className="metric-number mt-0.5 flex items-baseline gap-1 text-[19px] font-semibold leading-none text-ink">
                {value === null ? '—' : formatMetric(value, item.key)}
                <span className="text-[8px] font-normal text-ink-faint">
                  {t(`telemetry.unit.${item.key}`)}
                </span>
              </p>
              <div
                className="mt-2 h-[2px] rounded-full opacity-60"
                style={{
                  background: `linear-gradient(90deg, ${hexToRgba(item.color, active ? 0.8 : 0.3)}, transparent)`,
                }}
              />
            </button>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="panel overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-4 py-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg border"
              style={{
                borderColor: hexToRgba(metricMeta.color, 0.3),
                background: hexToRgba(metricMeta.color, 0.08),
                color: metricMeta.color,
              }}
            >
              {(() => {
                const Icon = metricMeta.icon
                return <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              })()}
            </span>
            <div className="min-w-0">
              <h2 className="text-[12.5px] font-semibold text-ink">{metricLabel}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-wide text-ink-faint">
                {device.name}
                <span className="h-2 w-px bg-line" />
                {unit}
                <span className="h-2 w-px bg-line" />
                {points.length} {t('telemetry.chart.points')}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Segmented<string>
                value={String(hours)}
                onChange={(value) => setHours(Number(value))}
                options={[
                  { value: '1', label: t('telemetry.range.h1') },
                  { value: '6', label: t('telemetry.range.h6') },
                  { value: '24', label: t('telemetry.range.h24') },
                  { value: '168', label: t('telemetry.range.d7') },
                ]}
                size="sm"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="h-3 w-3" />}
                onClick={exportCsv}
                disabled={points.length === 0}
              >
                <span className="hidden sm:inline">{t('telemetry.exportCsv')}</span>
              </Button>
            </div>
          </header>

          <div className="p-4">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {[
                { label: t('telemetry.chart.latest'), value: current, tone: 'text-ink' },
                { label: 'AVG', value: average, tone: 'text-ink-muted' },
                { label: 'MIN', value: minimum, tone: 'text-ink-muted' },
                { label: 'MAX', value: maximum, tone: 'text-ink-muted' },
                {
                  label: t('telemetry.chart.trend'),
                  value: change,
                  tone:
                    change === null
                      ? 'text-ink-muted'
                      : change >= 0
                        ? 'text-emerald-300'
                        : 'text-rose-300',
                  signed: true,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2"
                >
                  <p className="truncate text-[8.5px] text-ink-faint">{item.label}</p>
                  <p
                    className={cn(
                      'metric-number mt-1 flex items-baseline gap-0.5 text-[14px] font-semibold leading-none',
                      item.tone,
                    )}
                  >
                    {item.value === null
                      ? '—'
                      : `${item.signed && (item.value as number) > 0 ? '+' : ''}${formatMetric(
                          item.value as number,
                          metric,
                        )}`}
                    <span className="text-[7.5px] font-normal text-ink-faint">{unit}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="relative mt-3 h-[318px]">
              {history.isLoading ? (
                <div className="shimmer absolute inset-0 rounded-xl opacity-40" />
              ) : !available ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={Activity}
                    title={t('telemetry.unavailable.title')}
                    description={t('telemetry.unavailable.detail')}
                    className="w-full border-0 bg-transparent"
                  />
                </div>
              ) : points.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={Activity}
                    title={t('common.noData')}
                    description={t('telemetry.chart.hint')}
                    className="w-full border-0 bg-transparent"
                  />
                </div>
              ) : option ? (
                <EChart option={option} />
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.045] pt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-ink-faint/60">
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-accent" />
                {t('telemetry.chart.hint')}
              </span>
              <span className="flex items-center gap-2">
                {source === 'demo' ? <span>5s REFETCH</span> : null}
                <span className="h-2 w-px bg-line" />
                {isLiveSource(source) ? <span>1 Hz PERSIST</span> : null}
                <span className="h-2 w-px bg-line" />
                <span className="text-ink-faint/40">LOCAL</span>
              </span>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <SectionCard
            title={t('telemetry.source.title')}
            subtitle={t('telemetry.source.detail')}
            bodyClassName="p-3"
          >
            <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-[9.5px] text-ink-muted">
                <Usb className="h-3 w-3 text-ink-faint" />
                {source === 'demo'
                  ? 'SIM → UI'
                  : isLiveSource(source)
                    ? 'HID → UI'
                    : 'SNAPSHOT → UI'}
              </span>
              <span className="font-mono text-[8.5px] text-accent/80">
                {isLiveSource(source) ? t('telemetry.sampling.tenHz') : '—'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.014] px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-[9.5px] text-ink-muted">
                <Cable className="h-3 w-3 text-ink-faint" />
                {isLiveSource(source)
                  ? 'SQLite'
                  : source === 'snapshot'
                    ? 'JSON snapshot'
                    : 'localStorage'}
              </span>
              <span className="font-mono text-[8.5px] text-ink-muted">
                {isLiveSource(source) ? t('telemetry.sampling.oneHz') : '—'}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[9px]">
                <span className="text-ink-faint">{t('telemetry.sampling.persist')}</span>
                <span className="font-mono text-ink-muted">
                  {t('telemetry.sampling.sevenDays')} · {retentionDays}D
                </span>
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-ink-faint">{t('telemetry.sampling.retention')}</span>
                <span className="font-mono text-ink-muted">LOCAL ONLY</span>
              </div>
            </div>
            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-white/[0.05] bg-white/[0.016] p-2 text-[8.5px] leading-relaxed text-ink-faint">
              <ShieldCheck className="mt-px h-2.5 w-2.5 shrink-0 text-emerald-400/70" />
              {t('settings.data.localDetail')}
            </div>
          </SectionCard>

          <SectionCard
            title={t('telemetry.events.title')}
            action={
              <span className="flex items-center gap-1 font-mono text-[8px] text-ink-faint">
                <span className="live-dot scale-[0.5]" />
                {DATA_SOURCE_SHORT[source]}
              </span>
            }
            bodyClassName="p-3 space-y-2"
          >
            {(events.data ?? []).slice(0, 6).map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
            {events.data?.length === 0 ? (
              <p className="py-4 text-center text-[9.5px] text-ink-faint">
                {t('telemetry.events.empty')}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            title={t('telemetry.insights.title')}
            subtitle={`${failed.length} ${t('statusbar.warnings')}`}
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setStatus('warning')
                  setPage('overview')
                }}
                className="flex items-center gap-1 text-[8.5px] text-ink-faint transition-colors hover:text-accent"
              >
                {t('telemetry.insights.open')}
                <ArrowUpRight className="h-2.5 w-2.5" />
              </button>
            }
            bodyClassName="p-3 space-y-2"
          >
            {(diagnostics.data ?? []).slice(0, 3).map((diagnosis) => (
              <DiagnosticCard
                key={diagnosis.id}
                diagnosis={diagnosis}
                deviceName={diagnosis.deviceId ? deviceNames.get(diagnosis.deviceId) : undefined}
                compact
              />
            ))}
            {diagnostics.data?.length === 0 ? (
              <p className="py-4 text-center text-[9.5px] text-ink-faint">
                {t('telemetry.insights.empty')}
              </p>
            ) : null}
          </SectionCard>

          <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.012] p-3 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/60">
            <Radio className="h-3 w-3 text-accent/60" />
            {DATA_SOURCE_SAMPLING[source]}
          </div>
        </aside>
      </div>
    </div>
  )
}
