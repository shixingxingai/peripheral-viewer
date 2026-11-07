import {
  AlignCenterHorizontal,
  Check,
  Download,
  FileJson,
  Image as ImageIcon,
  Layers3,
  MousePointer2,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { DeviceGlyph } from '@/components/common/DeviceGlyph'
import { PageHeader } from '@/components/common/PageHeader'
import { SectionCard } from '@/components/common/SectionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { backend } from '@/lib/backend'
import { getDataSource } from '@/lib/backend/source'
import {
  clamp,
  cn,
  downloadBlob,
  downloadDataUrl,
  formatRelativeTime,
  hexToRgba,
} from '@/lib/utils'
import { useDeviceStore } from '@/stores/devices'
import { useLayoutStore } from '@/stores/layout'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { DeskLayout, DeviceCategory, DeviceSnapshot, LayoutItem } from '@/types/device'

const TOKEN_WIDTH: Record<DeviceCategory, number> = {
  monitor: 150,
  keyboard: 144,
  mouse: 66,
  headset: 84,
  webcam: 62,
  gamepad: 78,
  microphone: 58,
  speaker: 64,
  other: 70,
}

const CATEGORY_SLOTS: Record<DeviceCategory, Array<[number, number, number]>> = {
  monitor: [
    [36, 25, 1.08],
    [64, 25, 1.08],
    [50, 20, 1],
  ],
  keyboard: [
    [32, 59, 1.08],
    [66, 59, 1.08],
    [50, 72, 1],
  ],
  mouse: [
    [80, 57, 0.9],
    [91, 65, 0.9],
    [83, 73, 0.9],
  ],
  headset: [
    [10, 42, 0.92],
    [22, 55, 0.92],
    [90, 34, 0.88],
  ],
  webcam: [
    [45, 35, 0.78],
    [55, 35, 0.78],
    [50, 44, 0.72],
  ],
  gamepad: [
    [83, 82, 0.84],
    [93, 88, 0.84],
    [73, 88, 0.8],
  ],
  microphone: [[10, 72, 0.92]],
  speaker: [[90, 26, 0.9]],
  other: [[50, 84, 0.9]],
}

function buildDefaultItems(devices: DeviceSnapshot[]): LayoutItem[] {
  const counters = new Map<DeviceCategory, number>()
  return devices.map((device) => {
    const index = counters.get(device.category) ?? 0
    counters.set(device.category, index + 1)
    const slots = CATEGORY_SLOTS[device.category] ?? CATEGORY_SLOTS.other
    const slot = slots[index] ?? [
      clamp(18 + ((index * 13) % 64), 8, 92),
      clamp(30 + ((index * 17) % 50), 8, 92),
      0.88,
    ]
    return {
      deviceId: device.id,
      x: slot[0],
      y: slot[1],
      rotation: 0,
      scale: slot[2],
    }
  })
}

function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let value = text
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1)
  }
  return `${value}…`
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink disabled:pointer-events-none disabled:opacity-30',
        danger && 'hover:text-rose-300',
      )}
    >
      {children}
    </button>
  )
}

export function LayoutPage() {
  const { t } = useTranslation()
  const devices = useDeviceStore((state) => state.devices)
  const items = useLayoutStore((state) => state.items)
  const name = useLayoutStore((state) => state.name)
  const dirty = useLayoutStore((state) => state.dirty)
  const loaded = useLayoutStore((state) => state.loaded)
  const updatedAt = useLayoutStore((state) => state.updatedAt)
  const hydrate = useLayoutStore((state) => state.hydrate)
  const setItems = useLayoutStore((state) => state.setItems)
  const addItem = useLayoutStore((state) => state.addItem)
  const removeItem = useLayoutStore((state) => state.removeItem)
  const moveItem = useLayoutStore((state) => state.moveItem)
  const rotateItem = useLayoutStore((state) => state.rotateItem)
  const updateItem = useLayoutStore((state) => state.updateItem)
  const setName = useLayoutStore((state) => state.setName)
  const markSaved = useLayoutStore((state) => state.markSaved)
  const language = useSettingsStore((state) => state.language)
  const pushToast = useUiStore((state) => state.pushToast)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const deviceMap = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices])
  const selectedItem = items.find((item) => item.deviceId === selectedId) ?? null
  const selectedDevice = selectedItem ? deviceMap.get(selectedItem.deviceId) : undefined

  useEffect(() => {
    if (loaded || devices.length === 0) return
    let cancelled = false
    void backend
      .loadLayout()
      .then((layout) => {
        if (cancelled) return
        const validIds = new Set(devices.map((device) => device.id))
        const filtered: DeskLayout | null = layout
          ? { ...layout, items: layout.items.filter((item) => validIds.has(item.deviceId)) }
          : null
        hydrate(filtered, buildDefaultItems(devices))
      })
      .catch(() => {
        if (!cancelled) hydrate(null, buildDefaultItems(devices))
      })
    return () => {
      cancelled = true
    }
    // 每个会话只在设备列表首次非空时读取一次已保存的布局。
  }, [devices, loaded, hydrate])

  // 数据源整体替换后，旧设备 id 会失效：清理失效项并补齐新设备，避免桌面空白。
  useEffect(() => {
    if (!loaded || devices.length === 0) return
    const validIds = new Set(devices.map((device) => device.id))
    const kept = items.filter((item) => validIds.has(item.deviceId))
    if (kept.length === items.length) return
    const present = new Set(kept.map((item) => item.deviceId))
    const merged = [
      ...kept,
      ...buildDefaultItems(devices).filter((item) => !present.has(item.deviceId)),
    ]
    hydrate(
      {
        id: 'default',
        name: useLayoutStore.getState().name,
        items: merged,
        updatedAt: Date.now(),
      },
      merged,
    )
  }, [devices, hydrate, items, loaded])

  useEffect(() => {
    if (selectedId && !items.some((item) => item.deviceId === selectedId)) {
      setSelectedId(null)
    }
  }, [items, selectedId])

  useEffect(() => {
    if (!drag) return
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100 - drag.offsetX, 5, 95)
      const y = clamp(((event.clientY - rect.top) / rect.height) * 100 - drag.offsetY, 5, 95)
      moveItem(drag.id, x, y)
    }
    const onPointerUp = () => setDrag(null)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, moveItem])

  const startDrag = (event: React.PointerEvent, item: LayoutItem) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(item.deviceId)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    setDrag({ id: item.deviceId, offsetX: x - item.x, offsetY: y - item.y })
  }

  const addDevice = (device: DeviceSnapshot) => {
    const existing = items.find((item) => item.deviceId === device.id)
    if (existing) {
      setSelectedId(device.id)
      return
    }
    const index = items.length
    addItem({
      deviceId: device.id,
      x: clamp(18 + ((index * 13) % 64), 8, 92),
      y: clamp(30 + ((index * 17) % 48), 8, 92),
      rotation: 0,
      scale: 0.95,
    })
    setSelectedId(device.id)
    pushToast({ title: t('layout.added'), description: device.name, variant: 'success' })
  }

  const save = async () => {
    setSaving(true)
    try {
      await backend.saveLayout({
        id: 'desk-01',
        name,
        items,
        updatedAt: Date.now(),
      })
      markSaved()
      pushToast({ title: t('layout.saveSuccess'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('layout.saveFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const exportJson = () => {
    const payload = {
      id: 'desk-01',
      name,
      items,
      updatedAt: Date.now(),
      dataSource: getDataSource(),
    }
    downloadBlob(
      `${name.replace(/[\\/:*?"<>|\s]+/g, '-').toLowerCase() || 'desk-layout'}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    )
    pushToast({ title: t('layout.exportSuccess'), variant: 'success' })
  }

  const exportPng = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 1000
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const background = ctx.createLinearGradient(0, 0, 1600, 1000)
    background.addColorStop(0, '#05080e')
    background.addColorStop(0.55, '#080d16')
    background.addColorStop(1, '#04070c')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 1600, 1000)

    const glow = ctx.createRadialGradient(820, 380, 0, 820, 380, 700)
    glow.addColorStop(0, 'rgba(103,232,249,0.07)')
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 1600, 1000)

    ctx.strokeStyle = 'rgba(148,163,184,0.06)'
    ctx.lineWidth = 1
    for (let x = 0; x <= 1600; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 1000)
      ctx.stroke()
    }
    for (let y = 0; y <= 1000; y += 50) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(1600, y)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(148,163,184,0.13)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(44, 44, 1512, 912, 28)
    ctx.stroke()

    ctx.fillStyle = 'rgba(103,232,249,0.85)'
    ctx.font = '600 16px Inter, "Microsoft YaHei", sans-serif'
    ctx.fillText('PERIPHERY / DESK LAYOUT', 80, 96)
    ctx.fillStyle = '#e8eef7'
    ctx.font = '600 42px Inter, "Microsoft YaHei", sans-serif'
    ctx.fillText(name, 80, 150)
    ctx.fillStyle = 'rgba(148,163,184,0.55)'
    ctx.font = '500 16px Inter, "Microsoft YaHei", sans-serif'
    ctx.fillText(`${items.length} DEVICES · ${new Date().toLocaleString('zh-CN')}`, 80, 182)

    for (const item of items) {
      const device = deviceMap.get(item.deviceId)
      if (!device) continue
      const x = (item.x / 100) * 1600
      const y = (item.y / 100) * 1000
      const width = TOKEN_WIDTH[device.category] * item.scale * 2.05
      const height = width * 0.68
      const accent = device.accent

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((item.rotation * Math.PI) / 180)
      ctx.beginPath()
      ctx.roundRect(-width / 2, -height / 2, width, height, 18)
      ctx.fillStyle = hexToRgba(accent, 0.08)
      ctx.fill()
      ctx.strokeStyle = hexToRgba(accent, 0.45)
      ctx.lineWidth = 1.6
      ctx.stroke()

      ctx.fillStyle = hexToRgba(accent, 0.9)
      ctx.font = '600 13px Inter, "Microsoft YaHei", sans-serif'
      ctx.fillText(
        t(`category.${device.category}`).toUpperCase(),
        -width / 2 + 18,
        -height / 2 + 28,
      )
      ctx.fillStyle = '#e8eef7'
      ctx.font = '600 18px Inter, "Microsoft YaHei", sans-serif'
      const label = truncateCanvasText(ctx, device.name, width - 36)
      ctx.fillText(label, -width / 2 + 18, -height / 2 + 54)
      ctx.fillStyle = 'rgba(148,163,184,0.6)'
      ctx.font = '500 12px Inter, "Microsoft YaHei", sans-serif'
      ctx.fillText(device.manufacturer, -width / 2 + 18, height / 2 - 16)
      ctx.restore()
    }

    ctx.fillStyle = 'rgba(148,163,184,0.35)'
    ctx.font = '500 12px Inter, "Microsoft YaHei", sans-serif'
    ctx.fillText('LOCAL-FIRST · READ-ONLY INVENTORY · PERIPHERY', 80, 926)

    downloadDataUrl(
      `${name.replace(/[\\/:*?"<>|\s]+/g, '-').toLowerCase() || 'desk-layout'}.png`,
      canvas.toDataURL('image/png'),
    )
    pushToast({ title: t('layout.exportSuccess'), variant: 'success' })
  }

  const autoArrange = () => {
    setItems(buildDefaultItems(devices), true)
    setSelectedId(null)
  }

  return (
    <div className="mx-auto max-w-[1540px] px-4 py-5 xl:px-7 xl:py-6">
      <PageHeader
        eyebrow={
          <>
            <span className="text-accent/80">DESK</span>
            <span className="text-ink-faint/40">/</span>
            <span>LAYOUT</span>
          </>
        }
        title={t('layout.title')}
        subtitle={t('layout.subtitle')}
        actions={
          <>
            <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-white/[0.02] px-2.5 py-2 text-[9px] text-ink-faint sm:flex">
              <span
                className={cn('h-1 w-1 rounded-full', dirty ? 'bg-amber-400' : 'bg-emerald-400')}
              />
              {dirty ? t('layout.unsaved') : t('layout.savedAt')}
            </span>
            <Button
              variant="secondary"
              size="md"
              icon={<FileJson className="h-3.5 w-3.5" />}
              onClick={exportJson}
            >
              <span className="hidden md:inline">{t('common.exportJson')}</span>
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<ImageIcon className="h-3.5 w-3.5" />}
              onClick={exportPng}
            >
              <span className="hidden md:inline">{t('common.exportPng')}</span>
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Save className="h-3.5 w-3.5" />}
              onClick={() => void save()}
              disabled={saving || items.length === 0}
            >
              {saving ? t('common.loading') : t('layout.toolbar.save')}
            </Button>
          </>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[218px_minmax(0,1fr)_248px]">
        <aside className="order-2 xl:order-1">
          <SectionCard
            title={t('layout.sideTitle')}
            subtitle={t('layout.sideHint')}
            action={
              <Badge variant="neutral" size="sm">
                {devices.length}
              </Badge>
            }
            bodyClassName="p-1.5"
            className="xl:sticky xl:top-0"
          >
            <div className="max-h-[540px] space-y-0.5 overflow-y-auto scroll-thin pr-0.5">
              {devices.map((device) => {
                const added = items.some((item) => item.deviceId === device.id)
                const selected = selectedId === device.id
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => addDevice(device)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                      selected
                        ? 'border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.06)]'
                        : 'border-transparent hover:border-line hover:bg-white/[0.025]',
                    )}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
                      style={{
                        borderColor: hexToRgba(device.accent, 0.2),
                        background: hexToRgba(device.accent, 0.06),
                        color: device.accent,
                      }}
                    >
                      <CategoryIcon category={device.category} className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[9.5px] font-medium text-ink-muted">
                        {device.name}
                      </span>
                      <span className="block truncate text-[8px] text-ink-faint">
                        {device.manufacturer}
                      </span>
                    </span>
                    {added ? (
                      <Check className="h-3 w-3 shrink-0 text-emerald-400/80" />
                    ) : (
                      <Plus className="h-3 w-3 shrink-0 text-ink-faint" />
                    )}
                  </button>
                )
              })}
            </div>
          </SectionCard>
        </aside>

        <section className="order-1 min-w-0 xl:order-2">
          <div className="panel p-2.5 xl:p-3">
            <div
              ref={canvasRef}
              onPointerDown={() => setSelectedId(null)}
              className="relative h-[clamp(430px,58vh,640px)] w-full touch-none overflow-hidden rounded-xl border border-white/[0.06] bg-[#060910]"
            >
              <div className="absolute inset-0 grid-surface opacity-60" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_20%,rgba(var(--accent-rgb),0.07),transparent_65%)]" />
              <div className="pointer-events-none absolute inset-4 rounded-lg border border-dashed border-white/[0.07]" />
              <div className="pointer-events-none absolute left-6 top-5 flex items-center gap-2">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-ink-faint/70">
                  {t('layout.desk')}
                </span>
                <span className="h-2.5 w-px bg-line" />
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/45">
                  {items.length} {t('common.devices')} · TOP VIEW
                </span>
              </div>

              <div className="absolute right-6 top-4 z-30 flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#070a11]/72 p-0.5 backdrop-blur-xl">
                <ToolButton
                  label={t('layout.toolbar.rotate') + ' −90°'}
                  onClick={() =>
                    selectedItem &&
                    updateItem(selectedItem.deviceId, {
                      rotation: (selectedItem.rotation + 270) % 360,
                    })
                  }
                  disabled={!selectedItem}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </ToolButton>
                <ToolButton
                  label={t('layout.toolbar.rotate')}
                  onClick={() => selectedItem && rotateItem(selectedItem.deviceId)}
                  disabled={!selectedItem}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </ToolButton>
                <ToolButton
                  label={t('layout.inspector.scale') + ' +'}
                  onClick={() =>
                    selectedItem &&
                    updateItem(selectedItem.deviceId, {
                      scale: clamp(selectedItem.scale + 0.08, 0.55, 1.5),
                    })
                  }
                  disabled={!selectedItem}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </ToolButton>
                <ToolButton
                  label={t('layout.inspector.scale') + ' −'}
                  onClick={() =>
                    selectedItem &&
                    updateItem(selectedItem.deviceId, {
                      scale: clamp(selectedItem.scale - 0.08, 0.55, 1.5),
                    })
                  }
                  disabled={!selectedItem}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </ToolButton>
                <ToolButton
                  label={t('layout.inspector.center')}
                  onClick={() => selectedItem && updateItem(selectedItem.deviceId, { x: 50 })}
                  disabled={!selectedItem}
                >
                  <AlignCenterHorizontal className="h-3.5 w-3.5" />
                </ToolButton>
                <span className="mx-0.5 h-4 w-px bg-white/[0.08]" />
                <ToolButton label={t('layout.toolbar.autoArrange')} onClick={autoArrange}>
                  <Wand2 className="h-3.5 w-3.5" />
                </ToolButton>
                <ToolButton
                  label={t('layout.toolbar.remove')}
                  onClick={() => {
                    if (!selectedItem) return
                    removeItem(selectedItem.deviceId)
                    setSelectedId(null)
                    pushToast({ title: t('layout.removed'), variant: 'warning' })
                  }}
                  disabled={!selectedItem}
                  danger
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ToolButton>
              </div>

              {items.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Layers3 className="h-7 w-7 text-ink-faint/40" strokeWidth={1.4} />
                  <p className="text-[10.5px] text-ink-faint">{t('layout.empty')}</p>
                </div>
              ) : null}

              {items.map((item) => {
                const device = deviceMap.get(item.deviceId)
                if (!device) return null
                const selected = selectedId === item.deviceId
                const dragging = drag?.id === item.deviceId
                const width = TOKEN_WIDTH[device.category] * item.scale
                return (
                  <button
                    key={item.deviceId}
                    type="button"
                    onPointerDown={(event) => startDrag(event, item)}
                    onFocus={() => setSelectedId(item.deviceId)}
                    className={cn(
                      'group absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none text-left outline-none active:cursor-grabbing',
                      dragging && 'z-40',
                    )}
                    style={{ left: `${item.x}%`, top: `${item.y}%`, width }}
                    aria-label={`${device.name} · ${t('layout.selected')}`}
                  >
                    <div
                      className={cn(
                        'relative rounded-xl border bg-[#0a0f17]/88 px-1.5 pb-1.5 pt-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md transition-[border-color,box-shadow]',
                        selected
                          ? 'border-[rgba(var(--accent-rgb),0.55)] shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.22),0_0_30px_-10px_rgba(var(--accent-rgb),0.55)]'
                          : 'border-white/[0.09] group-hover:border-white/[0.2]',
                      )}
                    >
                      <div
                        className="transition-transform duration-200"
                        style={{ transform: `rotate(${item.rotation}deg)` }}
                      >
                        <DeviceGlyph category={device.category} accent={device.accent} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 border-t border-white/[0.05] px-0.5 pt-1">
                        <CategoryIcon
                          category={device.category}
                          className="h-2.5 w-2.5 shrink-0"
                          style={{ color: device.accent }}
                        />
                        <span className="truncate text-[8px] font-medium text-ink-muted">
                          {device.name}
                        </span>
                        {device.status === 'warning' ? (
                          <span className="ml-auto h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                        ) : null}
                      </div>
                      {selected ? (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.9)]" />
                      ) : null}
                    </div>
                  </button>
                )
              })}

              <div className="pointer-events-none absolute bottom-4 left-6 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/45">
                <MousePointer2 className="h-2.5 w-2.5" />
                {t('layout.hint')}
              </div>
              <div className="pointer-events-none absolute bottom-4 right-6 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint/35">
                16:10 · PERCENT COORDS · 100%
              </div>
            </div>
          </div>
        </section>

        <aside className="order-3">
          <SectionCard title={t('layout.inspector.title')} bodyClassName="p-3">
            <label className="block">
              <span className="mb-1 block text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {t('layout.toolbar.name')}
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-8 w-full rounded-md border border-line bg-white/[0.025] px-2.5 text-[11px] text-ink outline-none transition-colors focus:border-[rgba(var(--accent-rgb),0.4)]"
              />
            </label>

            <div className="mt-2 flex items-center justify-between rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5">
              <span className="flex items-center gap-1.5 text-[8.5px] text-ink-faint">
                <span
                  className={cn('h-1 w-1 rounded-full', dirty ? 'bg-amber-400' : 'bg-emerald-400')}
                />
                {dirty ? t('layout.inspector.unsavedState') : t('layout.inspector.savedState')}
              </span>
              {updatedAt ? (
                <span className="font-mono text-[7.5px] text-ink-faint/60">
                  {formatRelativeTime(updatedAt, language)}
                </span>
              ) : null}
            </div>

            {selectedItem && selectedDevice ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 border-b border-white/[0.05] pb-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md border"
                    style={{
                      borderColor: hexToRgba(selectedDevice.accent, 0.3),
                      background: hexToRgba(selectedDevice.accent, 0.08),
                      color: selectedDevice.accent,
                    }}
                  >
                    <CategoryIcon category={selectedDevice.category} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-medium text-ink">
                      {selectedDevice.name}
                    </p>
                    <p className="truncate text-[8px] text-ink-faint">
                      {selectedDevice.manufacturer}
                    </p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5">
                    <p className="text-[8px] text-ink-faint">{t('layout.inspector.position')} X</p>
                    <p className="font-mono text-[10px] text-ink-muted">
                      {selectedItem.x.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5">
                    <p className="text-[8px] text-ink-faint">{t('layout.inspector.position')} Y</p>
                    <p className="font-mono text-[10px] text-ink-muted">
                      {selectedItem.y.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5">
                    <p className="text-[8px] text-ink-faint">{t('layout.inspector.rotation')}</p>
                    <p className="font-mono text-[10px] text-ink-muted">{selectedItem.rotation}°</p>
                  </div>
                  <div className="rounded-md border border-white/[0.05] bg-white/[0.016] px-2 py-1.5">
                    <p className="text-[8px] text-ink-faint">{t('layout.inspector.scale')}</p>
                    <p className="font-mono text-[10px] text-ink-muted">
                      {Math.round(selectedItem.scale * 100)}%
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1">
                  <ToolButton
                    label={t('layout.toolbar.rotate')}
                    onClick={() => rotateItem(selectedItem.deviceId)}
                  >
                    <RotateCw className="h-3 w-3" />
                  </ToolButton>
                  <ToolButton
                    label={t('layout.inspector.scale') + ' +'}
                    onClick={() =>
                      updateItem(selectedItem.deviceId, {
                        scale: clamp(selectedItem.scale + 0.08, 0.55, 1.5),
                      })
                    }
                  >
                    <ZoomIn className="h-3 w-3" />
                  </ToolButton>
                  <ToolButton
                    label={t('layout.inspector.scale') + ' −'}
                    onClick={() =>
                      updateItem(selectedItem.deviceId, {
                        scale: clamp(selectedItem.scale - 0.08, 0.55, 1.5),
                      })
                    }
                  >
                    <ZoomOut className="h-3 w-3" />
                  </ToolButton>
                  <ToolButton
                    label={t('layout.inspector.center')}
                    onClick={() => updateItem(selectedItem.deviceId, { x: 50 })}
                  >
                    <AlignCenterHorizontal className="h-3 w-3" />
                  </ToolButton>
                  <ToolButton
                    label={t('layout.toolbar.remove')}
                    onClick={() => {
                      removeItem(selectedItem.deviceId)
                      setSelectedId(null)
                    }}
                    danger
                  >
                    <Trash2 className="h-3 w-3" />
                  </ToolButton>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-line px-2.5 py-3">
                <MousePointer2 className="mt-px h-3 w-3 shrink-0 text-ink-faint" />
                <p className="text-[9px] leading-relaxed text-ink-faint">
                  {t('layout.inspector.none')}
                </p>
              </div>
            )}

            <div className="mt-3 border-t border-white/[0.05] pt-2">
              <p className="mb-1 flex items-center justify-between text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {t('layout.inspector.layers')}
                <span className="font-mono text-[8px] normal-case tracking-normal text-ink-faint/60">
                  {items.length}
                </span>
              </p>
              {items.length === 0 ? (
                <p className="py-2 text-[9px] text-ink-faint/70">
                  {t('layout.inspector.emptyLayers')}
                </p>
              ) : (
                <div className="max-h-[260px] space-y-0.5 overflow-y-auto scroll-thin">
                  {items.map((item) => {
                    const device = deviceMap.get(item.deviceId)
                    if (!device) return null
                    const active = item.deviceId === selectedId
                    return (
                      <button
                        key={item.deviceId}
                        type="button"
                        onClick={() => setSelectedId(item.deviceId)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
                          active ? 'bg-[rgba(var(--accent-rgb),0.08)]' : 'hover:bg-white/[0.03]',
                        )}
                      >
                        <CategoryIcon
                          category={device.category}
                          className="h-2.5 w-2.5 shrink-0"
                          style={{ color: device.accent }}
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-[8.5px]',
                            active ? 'text-ink' : 'text-ink-muted',
                          )}
                        >
                          {device.name}
                        </span>
                        <span className="font-mono text-[7px] text-ink-faint/50">
                          {item.rotation}°
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              icon={<Wand2 className="h-3 w-3" />}
              onClick={autoArrange}
            >
              {t('layout.toolbar.autoArrange')}
            </Button>
          </SectionCard>
        </aside>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white/[0.012] px-3 py-2.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint/60">
        <span className="flex items-center gap-1.5">
          <Download className="h-2.5 w-2.5" />
          PNG / JSON · LOCAL EXPORT
        </span>
        <span className="flex items-center gap-3">
          <span>
            {items.length} {t('common.devices')}
          </span>
          <span className="h-2.5 w-px bg-line" />
          <span>{t('layout.deselect')}</span>
        </span>
      </div>
    </div>
  )
}
